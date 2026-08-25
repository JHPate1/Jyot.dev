/**
 * Virtual File System contract.
 * Every backend (File System Access API, OPFS, in-memory) implements this
 * identical surface so the IDE, the indexer and the AI agent never need to
 * know where the bytes actually live.
 */

export type FileKind = "file" | "directory";

export interface VNode {
  path: string; // posix, root = "" ; e.g. "src/App.tsx"
  name: string;
  kind: FileKind;
  size?: number;
  mtime?: number;
  children?: VNode[];
}

export type BackendId = "fsa" | "opfs" | "memory";

export interface VFS {
  id: BackendId;
  label: string;
  rootName: string;
  /** true when the backend can only be read (permission revoked) */
  readonly: boolean;

  listTree(): Promise<VNode>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content?: string): Promise<void>;
  createDir(path: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mtime: number } | null>;
  exists(path: string): Promise<boolean>;
}

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  "coverage",
  "venv",
  "__pycache__",
  ".venv",
  "target",
  ".svelte-kit",
]);

export const TEXT_EXT = new Set([
  "ts","tsx","js","jsx","mjs","cjs","json","jsonc","md","mdx","txt","css","scss","less",
  "html","htm","xml","svg","yml","yaml","toml","ini","env","sh","bash","zsh","py","rb",
  "go","rs","java","kt","c","h","cpp","hpp","cs","php","sql","graphql","gql","vue","svelte",
  "lock","gitignore","dockerfile","makefile","prisma","astro","tf","conf",
]);

export function extOf(path: string): string {
  const base = path.split("/").pop() || "";
  if (!base.includes(".")) return base.toLowerCase();
  return base.split(".").pop()!.toLowerCase();
}

export function isTextFile(path: string): boolean {
  return TEXT_EXT.has(extOf(path));
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.split("/").pop() || path;
}

export function joinPath(a: string, b: string): string {
  if (!a) return b;
  return `${a}/${b}`;
}

export function normalizePath(p: string): string {
  return p.replace(/^\.?\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

export function flattenFiles(node: VNode, out: VNode[] = []): VNode[] {
  if (node.kind === "file") out.push(node);
  node.children?.forEach((c) => flattenFiles(c, out));
  return out;
}
