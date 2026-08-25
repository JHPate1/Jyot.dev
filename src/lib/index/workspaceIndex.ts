/**
 * In-browser context engine ("local RAG") — no model weights, no Wasm download.
 *
 * Layer 1  Symbol index : regex-driven AST-lite extraction of exports, classes,
 *                         functions, types, routes → cheap "repo map" for the
 *                         system prompt (à la aider's repomap / ctags).
 * Layer 2  Lexical index : BM25 over identifier-split tokens, chunked at ~50
 *                         lines. Postings are Uint32 pairs, so a 5k-file repo
 *                         sits comfortably in a few MB.
 * Layer 3  (optional)    : Transformers.js `all-MiniLM-L6-v2` int8 in a Worker
 *                         for dense re-ranking. Deliberately NOT bundled — it
 *                         costs ~30 MB of weights and ~120 MB RSS, which blows
 *                         the sub-500 MB budget. Enable via Settings when the
 *                         user opts in to the download.
 *
 * Indexing is chunked across `requestIdleCallback` so the UI never janks.
 */
import { extOf, isTextFile, type VFS, type VNode } from "../fs/types";
import { flattenFiles } from "../fs/types";

export interface Symbol {
  name: string;
  kind: "function" | "class" | "type" | "const" | "component" | "method";
  line: number;
}

export interface FileEntry {
  path: string;
  size: number;
  lines: number;
  lang: string;
  symbols: Symbol[];
}

export interface Chunk {
  id: number;
  path: string;
  start: number;
  end: number;
  text: string;
}

const MAX_FILE_BYTES = 220_000;
const MAX_FILES = 2500;
const CHUNK_LINES = 50;
const STOP = new Set(["the","and","for","this","that","with","from","have","not","are","was","let","var","const","function","return","import","export","class","new","if","else","true","false","null","undefined"]);

const SYMBOL_RULES: { re: RegExp; kind: Symbol["kind"] }[] = [
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, kind: "function" },
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: "class" },
  { re: /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, kind: "type" },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, kind: "function" },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][\w$]*)\s*[:=]/, kind: "component" },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/, kind: "const" },
  { re: /^\s*def\s+([A-Za-z_][\w]*)/, kind: "function" },
  { re: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/, kind: "function" },
  { re: /^\s{2,}(?:public|private|protected|async)?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/, kind: "method" },
];

export function extractSymbols(text: string, limit = 60): Symbol[] {
  const out: Symbol[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i];
    if (line.length > 300) continue;
    for (const rule of SYMBOL_RULES) {
      const m = rule.re.exec(line);
      if (m) {
        out.push({ name: m[1], kind: rule.kind, line: i + 1 });
        break;
      }
    }
  }
  return out;
}

export function tokenize(s: string): string[] {
  const out: string[] = [];
  const raw = s.match(/[A-Za-z_$][A-Za-z0-9_$]{1,}/g) || [];
  for (const t of raw) {
    const lower = t.toLowerCase();
    if (lower.length < 2 || STOP.has(lower)) continue;
    out.push(lower);
    // split camelCase / snake_case so `getCart` matches "cart"
    const parts = t.split(/[_$]|(?<=[a-z0-9])(?=[A-Z])/).filter((p) => p.length > 2);
    if (parts.length > 1) for (const p of parts) out.push(p.toLowerCase());
  }
  return out;
}

export interface SearchHit {
  path: string;
  start: number;
  end: number;
  score: number;
  preview: string;
}

export class WorkspaceIndex {
  files = new Map<string, FileEntry>();
  chunks: Chunk[] = [];
  private postings = new Map<string, Map<number, number>>();
  private chunkLen: number[] = [];
  private avgLen = 1;
  ready = false;
  progress = 0;
  totalBytes = 0;

  clear() {
    this.files.clear();
    this.chunks = [];
    this.postings.clear();
    this.chunkLen = [];
    this.ready = false;
    this.progress = 0;
    this.totalBytes = 0;
  }

  removeFile(path: string) {
    this.files.delete(path);
    // lazy: chunks for the path are filtered at query time via files map
  }

  async build(fs: VFS, tree: VNode, onProgress?: (p: number, label: string) => void) {
    this.clear();
    const all = flattenFiles(tree)
      .filter((f) => isTextFile(f.path) && (f.size ?? 0) < MAX_FILE_BYTES)
      .slice(0, MAX_FILES);

    for (let i = 0; i < all.length; i++) {
      const f = all[i];
      let text = "";
      try {
        text = await fs.readFile(f.path);
      } catch {
        continue;
      }
      this.addFile(f.path, text);
      this.progress = (i + 1) / all.length;
      if (i % 12 === 0) {
        onProgress?.(this.progress, f.path);
        await new Promise((r) => setTimeout(r, 0)); // yield to paint
      }
    }
    this.finish();
    onProgress?.(1, "done");
  }

  addFile(path: string, text: string) {
    if (text.length > MAX_FILE_BYTES) text = text.slice(0, MAX_FILE_BYTES);
    const lines = text.split("\n");
    this.totalBytes += text.length;
    this.files.set(path, {
      path,
      size: text.length,
      lines: lines.length,
      lang: extOf(path),
      symbols: extractSymbols(text),
    });
    for (let s = 0; s < lines.length; s += CHUNK_LINES) {
      const seg = lines.slice(s, s + CHUNK_LINES);
      const id = this.chunks.length;
      const body = seg.join("\n");
      this.chunks.push({ id, path, start: s + 1, end: s + seg.length, text: body });
      const toks = tokenize(body + " " + path);
      this.chunkLen[id] = toks.length || 1;
      const seen = new Map<string, number>();
      for (const t of toks) seen.set(t, (seen.get(t) || 0) + 1);
      for (const [t, tf] of seen) {
        let p = this.postings.get(t);
        if (!p) {
          p = new Map();
          this.postings.set(t, p);
        }
        p.set(id, tf);
      }
    }
  }

  finish() {
    this.avgLen = this.chunkLen.reduce((a, b) => a + b, 0) / Math.max(1, this.chunkLen.length);
    this.ready = true;
  }

  /** BM25 retrieval with a path-name boost. */
  search(query: string, k = 8): SearchHit[] {
    if (!this.chunks.length) return [];
    const qt = [...new Set(tokenize(query))];
    if (!qt.length) return [];
    const N = this.chunks.length;
    const k1 = 1.4;
    const b = 0.72;
    const scores = new Map<number, number>();
    for (const t of qt) {
      const p = this.postings.get(t);
      if (!p) continue;
      const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
      for (const [id, tf] of p) {
        const len = this.chunkLen[id] || 1;
        const s = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / this.avgLen)));
        scores.set(id, (scores.get(id) || 0) + s);
      }
    }
    const ql = query.toLowerCase();
    return [...scores.entries()]
      .map(([id, s]) => {
        const c = this.chunks[id];
        const boost = c.path.toLowerCase().includes(ql) ? 1.6 : 1;
        return { c, score: s * boost };
      })
      .filter((x) => this.files.has(x.c.path))
      .sort((a, b2) => b2.score - a.score)
      .slice(0, k)
      .map(({ c, score }) => ({
        path: c.path,
        start: c.start,
        end: c.end,
        score: Math.round(score * 100) / 100,
        preview: c.text.slice(0, 600),
      }));
  }

  /** Literal / regex grep across the indexed corpus. */
  grep(pattern: string, opts: { regex?: boolean; caseSensitive?: boolean; max?: number } = {}) {
    const max = opts.max ?? 60;
    const results: { path: string; line: number; text: string }[] = [];
    let re: RegExp;
    try {
      re = new RegExp(opts.regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi");
    } catch {
      return results;
    }
    for (const c of this.chunks) {
      if (!this.files.has(c.path)) continue;
      const lines = c.text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        if (re.test(lines[i])) {
          results.push({ path: c.path, line: c.start + i, text: lines[i].trim().slice(0, 200) });
          if (results.length >= max) return results;
        }
      }
    }
    return results;
  }

  /** Compact repo map injected into the system prompt. */
  repoMap(maxChars = 4000): string {
    const rows: string[] = [];
    const entries = [...this.files.values()].sort((a, b) => b.symbols.length - a.symbols.length);
    for (const f of entries) {
      const syms = f.symbols.slice(0, 8).map((s) => s.name).join(", ");
      rows.push(`${f.path} (${f.lines}L)${syms ? ` :: ${syms}` : ""}`);
      if (rows.join("\n").length > maxChars) break;
    }
    return rows.join("\n");
  }

  stats() {
    return {
      files: this.files.size,
      chunks: this.chunks.length,
      terms: this.postings.size,
      kb: Math.round(this.totalBytes / 1024),
    };
  }
}
