import { get, set } from "idb-keyval";
import { type BackendId, type VFS, type VNode, basename, dirname, normalizePath } from "./types";

const IDB_KEY = "seeker:memfs:v1";
const LEGACY = ["kode:memfs:v1", "nvide:memfs:v1"];

export class MemoryFS implements VFS {
  id: BackendId = "memory";
  label = "Sample project (browser only)";
  rootName = "sample-project";
  readonly = false;
  private files = new Map<string, { content: string; mtime: number }>();
  private dirs = new Set<string>();
  private saveTimer: number | null = null;

  constructor(seed?: Record<string, string>) {
    if (seed) for (const [p, c] of Object.entries(seed)) this.seedFile(p, c);
  }

  static async load(seed: Record<string, string>): Promise<MemoryFS> {
    try {
      for (const k of [IDB_KEY, ...LEGACY]) {
        const stored = (await get(k)) as Record<string, string> | undefined;
        if (stored && Object.keys(stored).length) return new MemoryFS(stored);
      }
    } catch {}
    return new MemoryFS(seed);
  }

  private seedFile(path: string, content: string) {
    const p = normalizePath(path);
    this.files.set(p, { content, mtime: Date.now() });
    let d = dirname(p);
    while (d) { this.dirs.add(d); d = dirname(d); }
  }

  private persist() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      const obj: Record<string, string> = {};
      this.files.forEach((v, k) => (obj[k] = v.content));
      set(IDB_KEY, obj).catch(() => {});
    }, 600);
  }

  async listTree(): Promise<VNode> {
    const root: VNode = { path: "", name: this.rootName, kind: "directory", children: [] };
    const dirNode = new Map<string, VNode>([["", root]]);
    const ensureDir = (p: string): VNode => {
      if (dirNode.has(p)) return dirNode.get(p)!;
      const parent = ensureDir(dirname(p));
      const node: VNode = { path: p, name: basename(p), kind: "directory", children: [] };
      parent.children!.push(node);
      dirNode.set(p, node);
      return node;
    };
    [...this.dirs].sort().forEach(ensureDir);
    for (const [p, meta] of this.files) {
      ensureDir(dirname(p)).children!.push({ path: p, name: basename(p), kind: "file", size: meta.content.length, mtime: meta.mtime });
    }
    const sortRec = (n: VNode) => { n.children?.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1); n.children?.forEach(sortRec); };
    sortRec(root);
    return root;
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(normalizePath(path));
    if (!f) throw new Error(`File not found: ${path}`);
    return f.content;
  }
  async writeFile(path: string, content: string): Promise<void> { this.seedFile(path, content); this.persist(); }
  async createFile(path: string, content = ""): Promise<void> { await this.writeFile(path, content); }
  async createDir(path: string): Promise<void> { let d = normalizePath(path); while (d) { this.dirs.add(d); d = dirname(d); } }
  async deleteEntry(path: string): Promise<void> {
    const p = normalizePath(path);
    this.files.delete(p);
    for (const k of [...this.files.keys()]) if (k.startsWith(p + "/")) this.files.delete(k);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(p + "/")) this.dirs.delete(d);
    this.persist();
  }
  async rename(from: string, to: string): Promise<void> { const body = await this.readFile(from); await this.writeFile(to, body); await this.deleteEntry(from); }
  async stat(path: string) { const f = this.files.get(normalizePath(path)); return f ? { size: f.content.length, mtime: f.mtime } : null; }
  async exists(path: string) { return this.files.has(normalizePath(path)); }
}
