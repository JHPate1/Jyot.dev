/**
 * Tool-call parser + executor.
 *
 * We use a text protocol (```tool fenced JSON```) rather than OpenAI native
 * `tools`, because (a) it works on every NIM model including reasoning models
 * that stream `reasoning_content`, (b) it survives partial streams, and (c) it
 * renders beautifully in the transcript. The JSON shape is 1:1 with the OpenAI
 * function-calling schema below, so swapping to native tools is a 20-line change.
 */
import type { VFS } from "../fs/types";
import { normalizePath } from "../fs/types";
import type { WorkspaceIndex } from "../index/workspaceIndex";
import { unifiedPatch } from "../diff";
import { lintSource } from "../lint";

export type ToolName =
  | "read_file"
  | "list_dir"
  | "search_workspace"
  | "create_file"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "diff_preview"
  | "run_check"
  | "finish";

export interface ToolCall {
  id: string;
  tool: ToolName;
  args: Record<string, any>;
}

export interface ToolResult {
  id: string;
  tool: ToolName;
  ok: boolean;
  output: string;
  mutating: boolean;
  path?: string;
}

/** OpenAI-compatible JSON schema — kept in sync for native tool-calling swap. */
export const OPENAI_TOOL_SCHEMA = [
  { name: "read_file", description: "Read a workspace file with line numbers.", parameters: { type: "object", properties: { path: { type: "string" }, start: { type: "integer" }, end: { type: "integer" } }, required: ["path"] } },
  { name: "list_dir", description: "List direct children of a directory.", parameters: { type: "object", properties: { path: { type: "string" } }, required: [] } },
  { name: "search_workspace", description: "BM25 semantic-ish retrieval or literal/regex grep.", parameters: { type: "object", properties: { query: { type: "string" }, mode: { type: "string", enum: ["semantic", "grep"] }, regex: { type: "boolean" } }, required: ["query"] } },
  { name: "create_file", description: "Stage creation of a new file.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "write_file", description: "Stage a full-content overwrite.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "edit_file", description: "Stage an exact-match search/replace edit.", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" } }, required: ["path", "search", "replace"] } },
  { name: "delete_file", description: "Stage a file deletion.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "diff_preview", description: "Unified diff of all staged changes.", parameters: { type: "object", properties: { path: { type: "string" } }, required: [] } },
  { name: "run_check", description: "Static lint of staged content.", parameters: { type: "object", properties: { path: { type: "string" } }, required: [] } },
  { name: "finish", description: "End the run with a summary.", parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] } },
] as const;

// Matches any fenced code block regardless of the info-string the model used
// (```tool, ```json, ```json:tool, or a bare ```). We inspect the contents to
// decide whether it is actually a tool call, so we are tolerant of every model.
const ANY_FENCE = /```[^\n`]*\n([\s\S]*?)```/g;
const KNOWN_TOOLS = new Set<string>([
  "read_file", "list_dir", "search_workspace", "create_file", "write_file",
  "edit_file", "delete_file", "diff_preview", "run_check", "finish",
]);

/** Pull every {...} / [...] JSON candidate out of a chunk of text. */
function extractJsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          out.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

function coerceCalls(rawJson: string, push: (tool: string, args: any) => void): boolean {
  let obj: any;
  try {
    obj = JSON.parse(rawJson);
  } catch {
    return false;
  }
  const list = Array.isArray(obj) ? obj : [obj];
  let found = false;
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const name = o.tool ?? o.tool_name ?? o.name ?? o.function;
    if (typeof name === "string" && KNOWN_TOOLS.has(name)) {
      let args = o.args ?? o.arguments ?? o.parameters ?? o.input ?? {};
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          /* leave as-is */
        }
      }
      push(name, args ?? {});
      found = true;
    }
  }
  return found;
}

export function parseToolCalls(text: string): { calls: ToolCall[]; prose: string } {
  const calls: ToolCall[] = [];
  let i = 0;
  const push = (tool: string, args: any) => calls.push({ id: `t${Date.now()}_${i++}`, tool: tool as ToolName, args });

  const consumedRanges: [number, number][] = [];

  // 1) Prefer fenced blocks (any language tag). A fence that contains a tool
  //    call is removed from the visible prose; a fence that does not is kept.
  ANY_FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANY_FENCE.exec(text))) {
    const before = calls.length;
    // a fenced block may itself hold several JSON objects
    const candidates = extractJsonCandidates(m[1]);
    let matched = false;
    for (const c of candidates) matched = coerceCalls(c, push) || matched;
    if (!matched && m[1].trim().startsWith("{")) matched = coerceCalls(m[1].trim(), push);
    if (matched && calls.length > before) consumedRanges.push([m.index, m.index + m[0].length]);
  }

  // 2) Fallback: some models emit the JSON with no fence at all. Scan the
  //    non-fenced remainder for bare tool objects.
  if (!calls.length) {
    for (const c of extractJsonCandidates(text)) {
      const before = calls.length;
      if (coerceCalls(c, push) && calls.length > before) {
        const idx = text.indexOf(c);
        if (idx >= 0) consumedRanges.push([idx, idx + c.length]);
      }
    }
  }

  // Build prose with every consumed tool-call region stripped out.
  let prose = text;
  consumedRanges
    .sort((a, b) => b[0] - a[0])
    .forEach(([s, e]) => {
      prose = prose.slice(0, s) + prose.slice(e);
    });

  return { calls, prose: prose.trim() };
}

/** Staged mutation set — the "git index" of the agent. */
export interface StagedChange {
  path: string;
  kind: "create" | "modify" | "delete";
  before: string;
  after: string;
  origin: "agent" | "inline" | "user";
  ts: number;
}

export class Staging {
  changes = new Map<string, StagedChange>();

  get list(): StagedChange[] {
    return [...this.changes.values()].sort((a, b) => a.path.localeCompare(b.path));
  }
  get size() {
    return this.changes.size;
  }
  has(path: string) {
    return this.changes.has(path);
  }
  get(path: string) {
    return this.changes.get(path);
  }
  /** Content the agent should see: staged version wins over disk. */
  peek(path: string): string | null {
    const c = this.changes.get(path);
    if (!c) return null;
    return c.kind === "delete" ? null : c.after;
  }
  stage(c: StagedChange) {
    const prev = this.changes.get(c.path);
    if (!prev) {
      this.changes.set(c.path, c);
      return;
    }
    // a file the agent created and then deleted in the same run is a no-op
    if (prev.kind === "create" && c.kind === "delete") {
      this.changes.delete(c.path);
      return;
    }
    // the pre-image is always the very first `before` we saw for this path
    const kind = prev.kind === "create" && c.kind === "modify" ? "create" : c.kind;
    this.changes.set(c.path, { ...c, before: prev.before, kind });
  }
  drop(path: string) {
    this.changes.delete(path);
  }
  clear() {
    this.changes.clear();
  }
}

export interface ToolContext {
  fs: VFS;
  index: WorkspaceIndex;
  staging: Staging;
  onLog: (r: ToolResult) => void;
}

async function readEffective(ctx: ToolContext, path: string): Promise<string> {
  const staged = ctx.staging.peek(path);
  if (staged !== null) return staged;
  return ctx.fs.readFile(path);
}

function numbered(text: string, offset = 0, max = 3000): string {
  const lines = text.split("\n").slice(0, max);
  const w = String(offset + lines.length).length;
  return lines.map((l, i) => `${String(offset + i + 1).padStart(w, " ")}| ${l}`).join("\n");
}

export async function executeTool(ctx: ToolContext, call: ToolCall): Promise<ToolResult> {
  const base = { id: call.id, tool: call.tool };
  const path = call.args.path ? normalizePath(String(call.args.path)) : undefined;
  try {
    switch (call.tool) {
      case "read_file": {
        if (!path) throw new Error("path required");
        const text = await readEffective(ctx, path);
        const start = Math.max(1, Number(call.args.start) || 1);
        const total = text.split("\n").length;
        const end = Number(call.args.end) || Math.min(start + 2999, total);
        const slice = text.split("\n").slice(start - 1, end).join("\n");
        const truncatedNote = end < total ? `\n… [showing lines ${start}-${end} of ${total} — call read_file with start/end to read the rest]` : "";
        return { ...base, ok: true, mutating: false, path, output: (numbered(slice, start - 1) || "(empty file)") + truncatedNote };
      }
      case "list_dir": {
        const tree = await ctx.fs.listTree();
        const find = (n: any, p: string): any => {
          if (n.path === p) return n;
          for (const c of n.children ?? []) {
            const r = find(c, p);
            if (r) return r;
          }
          return null;
        };
        const node = path ? find(tree, path) : tree;
        if (!node) throw new Error(`no such directory: ${path}`);
        const rows = (node.children ?? []).map((c: any) => (c.kind === "directory" ? `${c.path}/` : `${c.path}  (${c.size ?? 0}b)`));
        return { ...base, ok: true, mutating: false, output: rows.join("\n") || "(empty)" };
      }
      case "search_workspace": {
        const q = String(call.args.query ?? "");
        if (call.args.mode === "grep") {
          const hits = ctx.index.grep(q, { regex: !!call.args.regex });
          return { ...base, ok: true, mutating: false, output: hits.length ? hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join("\n") : "no matches" };
        }
        const hits = ctx.index.search(q, 6);
        return {
          ...base,
          ok: true,
          mutating: false,
          output: hits.length
            ? hits.map((h) => `── ${h.path}:${h.start}-${h.end} (score ${h.score})\n${h.preview}`).join("\n\n")
            : "no matches",
        };
      }
      case "create_file": {
        if (!path) throw new Error("path required");
        const exists = await ctx.fs.exists(path);
        const content = String(call.args.content ?? "");
        ctx.staging.stage({ path, kind: exists ? "modify" : "create", before: exists ? await ctx.fs.readFile(path) : "", after: content, origin: "agent", ts: Date.now() });
        return { ...base, ok: true, mutating: true, path, output: `staged ${exists ? "overwrite" : "create"} ${path} (${content.split("\n").length} lines)` };
      }
      case "write_file": {
        if (!path) throw new Error("path required");
        const exists = await ctx.fs.exists(path);
        const before = exists ? await ctx.fs.readFile(path) : "";
        const content = String(call.args.content ?? "");
        ctx.staging.stage({ path, kind: exists ? "modify" : "create", before, after: content, origin: "agent", ts: Date.now() });
        return { ...base, ok: true, mutating: true, path, output: `staged write ${path} (${content.split("\n").length} lines)` };
      }
      case "edit_file": {
        if (!path) throw new Error("path required");
        const search = String(call.args.search ?? "");
        const replace = String(call.args.replace ?? "");
        const current = await readEffective(ctx, path);
        const disk = (await ctx.fs.exists(path)) ? await ctx.fs.readFile(path) : "";
        if (!search) throw new Error("search string required");
        const first = current.indexOf(search);
        if (first === -1) {
          const loose = current.replace(/[ \t]+/g, " ").indexOf(search.replace(/[ \t]+/g, " "));
          throw new Error(
            `search string not found in ${path}.${loose !== -1 ? " (whitespace-insensitive match exists — re-read the file and copy exact indentation)" : ""} Call read_file first.`,
          );
        }
        if (current.indexOf(search, first + 1) !== -1) throw new Error(`search string is ambiguous in ${path} (appears more than once) — include more surrounding context.`);
        const after = current.slice(0, first) + replace + current.slice(first + search.length);
        ctx.staging.stage({ path, kind: "modify", before: disk, after, origin: "agent", ts: Date.now() });
        return { ...base, ok: true, mutating: true, path, output: `staged edit ${path}: -${search.split("\n").length} +${replace.split("\n").length} lines` };
      }
      case "delete_file": {
        if (!path) throw new Error("path required");
        const before = (await ctx.fs.exists(path)) ? await ctx.fs.readFile(path) : "";
        ctx.staging.stage({ path, kind: "delete", before, after: "", origin: "agent", ts: Date.now() });
        return { ...base, ok: true, mutating: true, path, output: `staged delete ${path}` };
      }
      case "diff_preview": {
        const items = ctx.staging.list.filter((c) => !path || c.path === path);
        if (!items.length) return { ...base, ok: true, mutating: false, output: "nothing staged" };
        return { ...base, ok: true, mutating: false, output: items.map((c) => unifiedPatch(c.path, c.before, c.after)).join("\n\n").slice(0, 8000) };
      }
      case "run_check": {
        const items = ctx.staging.list.filter((c) => (!path || c.path === path) && c.kind !== "delete");
        if (!items.length) return { ...base, ok: true, mutating: false, output: "nothing staged to check" };
        const rows: string[] = [];
        for (const c of items) {
          const problems = lintSource(c.path, c.after);
          rows.push(problems.length ? problems.map((p) => `${c.path}:${p.line} ${p.severity}: ${p.message}`).join("\n") : `${c.path}: clean`);
        }
        return { ...base, ok: true, mutating: false, output: rows.join("\n") };
      }
      case "finish":
        return { ...base, ok: true, mutating: false, output: String(call.args.summary ?? "done") };
      default:
        throw new Error(`unknown tool: ${call.tool}`);
    }
  } catch (e: any) {
    return { ...base, ok: false, mutating: false, path, output: `ERROR: ${e?.message ?? String(e)}` };
  }
}
