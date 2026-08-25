/**
 * Shared adapter for anything that exposes a `FileSystemDirectoryHandle`.
 *
 * Two backends ride on this file:
 *   1. "fsa"  -> real local disk via showDirectoryPicker()  (readwrite permission)
 *   2. "opfs" -> Origin Private File System via navigator.storage.getDirectory()
 *
 * Handle resolution is memoised in a path->handle LRU so deep trees don't cost
 * an O(depth) traversal on every keystroke-save.
 */
import {
  IGNORED_DIRS,
  type BackendId,
  type VFS,
  type VNode,
  basename,
  dirname,
  joinPath,
  normalizePath,
} from "./types";

const MAX_HANDLE_CACHE = 800;

export class HandleFS implements VFS {
  id: BackendId;
  label: string;
  rootName: string;
  readonly = false;
  root: FileSystemDirectoryHandle;
  private cache = new Map<string, FileSystemHandle>();

  constructor(root: FileSystemDirectoryHandle, id: BackendId, label: string) {
    this.root = root;
    this.id = id;
    this.label = label;
    this.rootName = root.name || (id === "opfs" ? "opfs-workspace" : "workspace");
  }

  private remember(path: string, h: FileSystemHandle) {
    if (this.cache.size > MAX_HANDLE_CACHE) {
      // cheap FIFO eviction — keeps memory flat on huge repos
      const k = this.cache.keys().next().value;
      if (k !== undefined) this.cache.delete(k);
    }
    this.cache.set(path, h);
  }

  invalidate(path?: string) {
    if (!path) this.cache.clear();
    else for (const k of [...this.cache.keys()]) if (k === path || k.startsWith(path + "/")) this.cache.delete(k);
  }

  private async dirHandle(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    const p = normalizePath(path);
    if (!p) return this.root;
    const hit = this.cache.get(p);
    if (hit && hit.kind === "directory") return hit as FileSystemDirectoryHandle;
    let cur = this.root;
    for (const seg of p.split("/")) {
      cur = await cur.getDirectoryHandle(seg, { create });
    }
    this.remember(p, cur);
    return cur;
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const p = normalizePath(path);
    const hit = this.cache.get(p);
    if (hit && hit.kind === "file") return hit as FileSystemFileHandle;
    const dir = await this.dirHandle(dirname(p), create);
    const fh = await dir.getFileHandle(basename(p), { create });
    this.remember(p, fh);
    return fh;
  }

  async listTree(): Promise<VNode> {
    const walk = async (dir: FileSystemDirectoryHandle, path: string, depth: number): Promise<VNode> => {
      const children: VNode[] = [];
      if (depth < 12) {
        // @ts-expect-error async iterator on directory handle
        for await (const [name, handle] of dir.entries()) {
          if (name.startsWith(".") && name !== ".env" && name !== ".gitignore") continue;
          const childPath = joinPath(path, name);
          if (handle.kind === "directory") {
            if (IGNORED_DIRS.has(name)) {
              children.push({ path: childPath, name, kind: "directory", children: [] });
              continue;
            }
            children.push(await walk(handle as FileSystemDirectoryHandle, childPath, depth + 1));
          } else {
            let size = 0;
            let mtime = 0;
            try {
              const f = await (handle as FileSystemFileHandle).getFile();
              size = f.size;
              mtime = f.lastModified;
            } catch {
              /* ignore locked files */
            }
            this.remember(childPath, handle as FileSystemHandle);
            children.push({ path: childPath, name, kind: "file", size, mtime });
          }
        }
      }
      children.sort((a, b) =>
        a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1,
      );
      return { path, name: path ? basename(path) : this.rootName, kind: "directory", children };
    };
    return walk(this.root, "", 0);
  }

  async readFile(path: string): Promise<string> {
    const fh = await this.fileHandle(path);
    const file = await fh.getFile();
    return file.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    const fh = await this.fileHandle(path, true);
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async createFile(path: string, content = ""): Promise<void> {
    await this.writeFile(path, content);
  }

  async createDir(path: string): Promise<void> {
    await this.dirHandle(path, true);
  }

  async deleteEntry(path: string): Promise<void> {
    const p = normalizePath(path);
    const dir = await this.dirHandle(dirname(p));
    await dir.removeEntry(basename(p), { recursive: true });
    this.invalidate(p);
  }

  async rename(from: string, to: string): Promise<void> {
    const body = await this.readFile(from);
    await this.writeFile(to, body);
    await this.deleteEntry(from);
  }

  async stat(path: string) {
    try {
      const fh = await this.fileHandle(path);
      const f = await fh.getFile();
      return { size: f.size, mtime: f.lastModified };
    } catch {
      return null;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }
}

export function supportsFSA(): boolean {
  return typeof (globalThis as any).showDirectoryPicker === "function";
}

export function supportsOPFS(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

/** Permission lifecycle helper — query → request → verify. */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<PermissionState> {
  const anyH = handle as any;
  if (!anyH.queryPermission) return "granted";
  let state: PermissionState = await anyH.queryPermission({ mode });
  if (state === "prompt") state = await anyH.requestPermission({ mode });
  return state;
}
