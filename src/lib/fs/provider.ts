import { get, set, del } from "idb-keyval";
import { HandleFS, ensurePermission, supportsFSA, supportsOPFS } from "./handleFs";
import { MemoryFS } from "./memoryFs";
import { DEMO_WORKSPACE } from "./demoWorkspace";
import type { VFS } from "./types";

const HANDLE_KEY = "seeker:root-handle:v1";
const LEGACY_KEYS = ["kode:root-handle:v1", "nvide:root-handle:v1"];

export interface Capabilities {
  fsa: boolean;
  opfs: boolean;
  workers: boolean;
  memoryApi: boolean;
}

export function detectCapabilities(): Capabilities {
  return {
    fsa: supportsFSA(),
    opfs: supportsOPFS(),
    workers: typeof Worker !== "undefined",
    memoryApi: !!(performance as any).memory,
  };
}

export async function pickLocalDirectory(): Promise<VFS> {
  const handle: FileSystemDirectoryHandle = await (globalThis as any).showDirectoryPicker({
    mode: "readwrite",
    startIn: "documents",
  });
  const state = await ensurePermission(handle, "readwrite");
  if (state !== "granted") throw new Error("Seeker Code needs permission to save changes in this folder.");
  try { await set(HANDLE_KEY, handle); } catch {}
  return new HandleFS(handle, "fsa", "Local folder");
}

export async function restoreLocalDirectory(): Promise<{ fs: VFS | null; needsGesture: boolean; name?: string }> {
  try {
    let handle: FileSystemDirectoryHandle | undefined;
    for (const k of [HANDLE_KEY, ...LEGACY_KEYS]) {
      handle = (await get(k)) as FileSystemDirectoryHandle | undefined;
      if (handle) break;
    }
    if (!handle) return { fs: null, needsGesture: false };
    const anyH = handle as any;
    const state: PermissionState = anyH.queryPermission ? await anyH.queryPermission({ mode: "readwrite" }) : "granted";
    if (state === "granted") return { fs: new HandleFS(handle, "fsa", "Local folder"), needsGesture: false, name: handle.name };
    return { fs: null, needsGesture: true, name: handle.name };
  } catch {
    return { fs: null, needsGesture: false };
  }
}

export async function reconsentLocalDirectory(): Promise<VFS | null> {
  let handle: FileSystemDirectoryHandle | undefined;
  for (const k of [HANDLE_KEY, ...LEGACY_KEYS]) {
    handle = (await get(k)) as FileSystemDirectoryHandle | undefined;
    if (handle) break;
  }
  if (!handle) return null;
  const state = await ensurePermission(handle, "readwrite");
  if (state !== "granted") return null;
  return new HandleFS(handle, "fsa", "Local folder");
}

export async function forgetLocalDirectory() {
  for (const k of [HANDLE_KEY, ...LEGACY_KEYS]) await del(k).catch(() => {});
}

export async function openOPFS(): Promise<VFS> {
  const root = await navigator.storage.getDirectory();
  const ws = await root.getDirectoryHandle("seeker-workspace", { create: true });
  const fs = new HandleFS(ws, "opfs", "Private browser storage");
  const tree = await fs.listTree();
  if (!tree.children?.length) for (const [p, c] of Object.entries(DEMO_WORKSPACE)) await fs.writeFile(p, c);
  return fs;
}

export async function openMemory(): Promise<VFS> {
  return MemoryFS.load(DEMO_WORKSPACE);
}
