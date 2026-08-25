import { create } from "zustand";
import type { VFS, VNode } from "@/lib/fs/types";
import { basename, flattenFiles, normalizePath } from "@/lib/fs/types";
import {
  detectCapabilities,
  forgetLocalDirectory,
  openMemory,
  openOPFS,
  pickLocalDirectory,
  reconsentLocalDirectory,
  restoreLocalDirectory,
  type Capabilities,
} from "@/lib/fs/provider";
import { FsWatcher, type WatchEvent } from "@/lib/fs/watcher";
import { WorkspaceIndex } from "@/lib/index/workspaceIndex";
import { Staging, executeTool, type ToolCall, type ToolResult } from "@/lib/ai/tools";
import { runAgent } from "@/lib/ai/agent";
import { buildSystemPrompt, INLINE_EDIT_PROMPT } from "@/lib/ai/prompt";
import { completeOnce, estimateTokens, streamChat, type ChatMessage } from "@/lib/ai/nvidiaClient";
import { loadSettings, saveSettings, type ModelSettings } from "@/lib/ai/config";
import { lintSource, type Problem } from "@/lib/lint";

export interface Buffer {
  path: string;
  content: string;
  disk: string;
  dirty: boolean;
  extVersion: number;
  problems: Problem[];
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  tools?: { call: ToolCall; result?: ToolResult }[];
  streaming?: boolean;
  error?: boolean;
  ts: number;
  contextPaths?: string[];
}

export interface Checkpoint {
  id: string;
  label: string;
  ts: number;
  files: { path: string; content: string | null }[];
}

export type PanelTab = "chat" | "diff" | "search" | "problems" | "blueprint";

interface IdeState {
  caps: Capabilities;
  fs: VFS | null;
  tree: VNode | null;
  backendLabel: string;
  needsGesture: boolean;
  restoredName?: string;
  booting: boolean;
  fsError: string | null;

  buffers: Record<string, Buffer>;
  openTabs: string[];
  activeTab: string | null;
  selection: string;
  expanded: Record<string, boolean>;

  index: WorkspaceIndex;
  indexing: boolean;
  indexProgress: number;
  indexLabel: string;
  indexVersion: number;

  staging: Staging;
  stagingVersion: number;

  chat: ChatTurn[];
  running: boolean;
  agentMode: boolean;
  step: number;
  totalTokens: number;
  abort: AbortController | null;

  settings: ModelSettings;
  panel: PanelTab;
  activeDiffPath: string | null;
  checkpoints: Checkpoint[];
  toasts: { id: string; msg: string; kind: "info" | "error" | "ok" }[];
  externalChanges: string[];
  paletteOpen: false | "files" | "commands";
  inlineEdit: { open: boolean; busy: boolean; result?: string };

  // actions
  boot: () => Promise<void>;
  connectLocal: () => Promise<void>;
  reconnect: () => Promise<void>;
  useOPFS: () => Promise<void>;
  useDemo: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshTree: (reindex?: boolean) => Promise<void>;
  reindex: () => Promise<void>;
  toggleDir: (path: string) => void;

  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  updateBuffer: (path: string, content: string) => void;
  saveFile: (path?: string) => Promise<void>;
  saveAll: () => Promise<void>;
  setSelection: (s: string) => void;
  createEntry: (path: string, kind: "file" | "directory") => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (from: string, to: string) => Promise<void>;

  send: (text: string, contextPaths?: string[]) => Promise<void>;
  stop: () => void;
  clearChat: () => void;
  setAgentMode: (v: boolean) => void;
  inlineEditRun: (instruction: string) => Promise<void>;

  acceptChange: (path: string, content?: string) => Promise<void>;
  rejectChange: (path: string) => void;
  acceptAll: () => Promise<void>;
  rejectAll: () => void;
  restoreCheckpoint: (id: string) => Promise<void>;

  setSettings: (p: Partial<ModelSettings>) => void;
  setPanel: (p: PanelTab) => void;
  setDiffPath: (p: string | null) => void;
  toast: (msg: string, kind?: "info" | "error" | "ok") => void;
  setPalette: (v: false | "files" | "commands") => void;
  setInlineEdit: (v: Partial<IdeState["inlineEdit"]>) => void;
}

let watcher: FsWatcher | null = null;

export const useIde = create<IdeState>((set, get) => ({
  caps: detectCapabilities(),
  fs: null,
  tree: null,
  backendLabel: "no workspace",
  needsGesture: false,
  booting: true,
  fsError: null,

  buffers: {},
  openTabs: [],
  activeTab: null,
  selection: "",
  expanded: { "": true, src: true },

  index: new WorkspaceIndex(),
  indexing: false,
  indexProgress: 0,
  indexLabel: "",
  indexVersion: 0,

  staging: new Staging(),
  stagingVersion: 0,

  chat: [],
  running: false,
  agentMode: true,
  step: 0,
  totalTokens: 0,
  abort: null,

  settings: loadSettings(),
  panel: "chat",
  activeDiffPath: null,
  checkpoints: [],
  toasts: [],
  externalChanges: [],
  paletteOpen: false,
  inlineEdit: { open: false, busy: false },

  toast(msg, kind = "info") {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },

  async boot() {
    const r = await restoreLocalDirectory();
    if (r.fs) {
      await attach(r.fs, set, get);
    } else {
      set({ needsGesture: r.needsGesture, restoredName: r.name });
    }
    set({ booting: false });
  },

  async connectLocal() {
    try {
      const fs = await pickLocalDirectory();
      await attach(fs, set, get);
      get().toast(`Connected to /${fs.rootName} with read+write`, "ok");
    } catch (e: any) {
      if (e?.name !== "AbortError") set({ fsError: e?.message ?? String(e) });
    }
  },

  async reconnect() {
    const fs = await reconsentLocalDirectory();
    if (fs) {
      await attach(fs, set, get);
      set({ needsGesture: false });
    } else get().toast("Permission not granted", "error");
  },

  async useOPFS() {
    try {
      await attach(await openOPFS(), set, get);
    } catch (e: any) {
      set({ fsError: e?.message });
    }
  },

  async useDemo() {
    await attach(await openMemory(), set, get);
  },

  async disconnect() {
    watcher?.stop();
    watcher = null;
    await forgetLocalDirectory();
    get().index.clear();
    set({ fs: null, tree: null, buffers: {}, openTabs: [], activeTab: null, backendLabel: "no workspace", needsGesture: false });
  },

  async refreshTree(reindex = false) {
    const { fs } = get();
    if (!fs) return;
    if ("invalidate" in (fs as any)) (fs as any).invalidate();
    const tree = await fs.listTree();
    set({ tree });
    await watcher?.primeFromTree(tree);
    if (reindex) await get().reindex();
  },

  async reindex() {
    const { fs, index } = get();
    if (!fs) return;
    set({ indexing: true, indexProgress: 0 });
    const tree = get().tree ?? (await fs.listTree());
    await index.build(fs, tree, (p, label) => set({ indexProgress: p, indexLabel: label }));
    set({ indexing: false, indexVersion: get().indexVersion + 1 });
  },

  toggleDir(path) {
    set((s) => ({ expanded: { ...s.expanded, [path]: !s.expanded[path] } }));
  },

  async openFile(path) {
    const { fs, buffers } = get();
    if (!fs) return;
    if (!buffers[path]) {
      let content = "";
      try {
        content = await fs.readFile(path);
      } catch (e: any) {
        // a file the agent staged as `create` doesn't exist on disk yet — show the stage
        const staged = get().staging.peek(path);
        if (staged === null) {
          get().toast(`Cannot open ${path}: ${e.message}`, "error");
          return;
        }
        content = staged;
      }
      set((s) => ({
        buffers: { ...s.buffers, [path]: { path, content, disk: content, dirty: false, extVersion: 0, problems: lintSource(path, content) } },
      }));
    }
    set((s) => ({
      openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
      activeTab: path,
    }));
  },

  closeTab(path) {
    set((s) => {
      const openTabs = s.openTabs.filter((p) => p !== path);
      const buffers = { ...s.buffers };
      if (!buffers[path]?.dirty) delete buffers[path];
      return { openTabs, buffers, activeTab: s.activeTab === path ? openTabs[openTabs.length - 1] ?? null : s.activeTab };
    });
  },

  setActive(path) {
    set({ activeTab: path });
  },

  updateBuffer(path, content) {
    set((s) => {
      const b = s.buffers[path];
      if (!b || b.content === content) return {};
      return { buffers: { ...s.buffers, [path]: { ...b, content, dirty: content !== b.disk } } };
    });
  },

  async saveFile(path) {
    const { fs, activeTab } = get();
    const p = path ?? activeTab;
    if (!fs || !p) return;
    const b = get().buffers[p];
    if (!b) return;
    try {
      await fs.writeFile(p, b.content);
      await watcher?.touch(p);
      get().index.addFile(p, b.content);
      get().index.finish();
      set((s) => ({
        buffers: { ...s.buffers, [p]: { ...s.buffers[p], disk: b.content, dirty: false, problems: lintSource(p, b.content) } },
        indexVersion: s.indexVersion + 1,
      }));
      get().toast(`Saved ${basename(p)}`, "ok");
    } catch (e: any) {
      get().toast(`Save failed: ${e.message}`, "error");
    }
  },

  async saveAll() {
    for (const p of get().openTabs) if (get().buffers[p]?.dirty) await get().saveFile(p);
  },

  setSelection(s) {
    set({ selection: s });
  },

  async createEntry(path, kind) {
    const { fs } = get();
    if (!fs) return;
    const p = normalizePath(path);
    if (kind === "file") await fs.createFile(p, "");
    else await fs.createDir(p);
    await get().refreshTree();
    if (kind === "file") await get().openFile(p);
  },

  async deletePath(path) {
    const { fs } = get();
    if (!fs) return;
    await fs.deleteEntry(path);
    get().index.removeFile(path);
    get().closeTab(path);
    await get().refreshTree();
    get().toast(`Deleted ${path}`, "ok");
  },

  async renamePath(from, to) {
    const { fs } = get();
    if (!fs) return;
    await fs.rename(from, normalizePath(to));
    get().closeTab(from);
    await get().refreshTree();
    await get().openFile(normalizePath(to));
  },

  setAgentMode(v) {
    set({ agentMode: v });
  },

  clearChat() {
    set({ chat: [], totalTokens: 0 });
  },

  stop() {
    get().abort?.abort();
    set({ running: false, abort: null });
  },

  async send(text, contextPaths = []) {
    const st = get();
    if (st.running) return;
    if (!st.fs) return st.toast("Open a workspace first", "error");
    if (!st.settings.apiKey) return st.toast("Set your NVIDIA API key in Settings", "error");

    const abort = new AbortController();
    const userTurn: ChatTurn = { id: rid(), role: "user", content: text, ts: Date.now(), contextPaths };
    const asstId = rid();
    const asst: ChatTurn = { id: asstId, role: "assistant", content: "", reasoning: "", tools: [], streaming: true, ts: Date.now() };
    set({ chat: [...st.chat, userTurn, asst], running: true, abort, step: 0, panel: "chat" });

    // ---- context assembly (local RAG) --------------------------------------
    const active = st.activeTab ? st.buffers[st.activeTab] : null;
    const attached = new Set(contextPaths);
    if (st.activeTab) attached.add(st.activeTab);
    const hits = st.index.search(text, st.settings.contextFiles);
    for (const h of hits.slice(0, st.settings.contextFiles)) attached.add(h.path);

    const blocks: string[] = [];
    let budget = 46_000;
    for (const p of attached) {
      const staged = st.staging.peek(p);
      let body = staged ?? st.buffers[p]?.content;
      if (body === undefined) {
        try {
          body = await st.fs.readFile(p);
        } catch {
          continue;
        }
      }
      if (body.length > budget) body = body.slice(0, budget);
      budget -= body.length;
      blocks.push(`<file path="${p}">\n${body}\n</file>`);
      if (budget <= 0) break;
    }

    const system = buildSystemPrompt({
      index: st.index,
      rootName: st.fs.rootName,
      backend: st.backendLabel,
      openFiles: st.openTabs,
      activeFile: active ? { path: active.path, content: active.content, selection: st.selection } : null,
      agentMode: st.agentMode,
    });

    const history: ChatMessage[] = st.chat
      .filter((t) => t.role !== "system" && t.content)
      .slice(-8)
      .map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.content }));

    history.push({
      role: "user",
      content: `${blocks.length ? `## ATTACHED CONTEXT\n${blocks.join("\n\n")}\n\n` : ""}## REQUEST\n${text}`,
    });

    const patch = (fn: (t: ChatTurn) => ChatTurn) =>
      set((s) => ({ chat: s.chat.map((t) => (t.id === asstId ? fn(t) : t)) }));

    // ---- run ----------------------------------------------------------------
    if (!st.agentMode) {
      try {
        const r = await streamChat(
          st.settings,
          [{ role: "system", content: system }, ...history],
          {
            onReasoning: (d) => patch((t) => ({ ...t, reasoning: (t.reasoning ?? "") + d })),
            onContent: (d) => patch((t) => ({ ...t, content: t.content + d })),
            onUsage: (u) => set({ totalTokens: get().totalTokens + (u.total_tokens ?? 0) }),
          },
          abort.signal,
        );
        if (!r.usage) set({ totalTokens: get().totalTokens + estimateTokens(system + text + r.content) });
      } catch (e: any) {
        patch((t) => ({ ...t, content: t.content + `\n\n**Request failed** — ${e.message}`, error: true }));
      }
      patch((t) => ({ ...t, streaming: false }));
      set({ running: false, abort: null });
      return;
    }

    // snapshot for undo before an agent run touches anything
    const cpFiles: { path: string; content: string | null }[] = [];

    await runAgent({
      settings: st.settings,
      system,
      history,
      ctx: {
        fs: st.fs,
        index: st.index,
        staging: st.staging,
        onLog: () => {},
      },
      signal: abort.signal,
      callbacks: {
        onStep: (n) => set({ step: n }),
        onReasoning: (d) => patch((t) => ({ ...t, reasoning: (t.reasoning ?? "") + d })),
        onContent: (d) => patch((t) => ({ ...t, content: t.content + d })),
        onAssistantDone: () => {},
        onUsage: (u) => set({ totalTokens: get().totalTokens + (u.total_tokens ?? 0) }),
        onToolStart: (call) => patch((t) => ({ ...t, tools: [...(t.tools ?? []), { call }] })),
        onToolResult: (result) => {
          patch((t) => ({
            ...t,
            tools: (t.tools ?? []).map((x) => (x.call.id === result.id ? { ...x, result } : x)),
          }));
          if (result.mutating) set((s) => ({ stagingVersion: s.stagingVersion + 1 }));
        },
        onFinish: async (reason, detail) => {
          patch((t) => ({
            ...t,
            streaming: false,
            error: reason === "error",
            content:
              t.content +
              (reason === "error"
                ? `\n\n**Agent error** — ${detail}`
                : reason === "budget"
                  ? `\n\n_Step budget reached (${st.settings.maxAgentSteps}). Ask me to continue._`
                  : ""),
          }));
          set({ running: false, abort: null, stagingVersion: get().stagingVersion + 1 });
          const staged = get().staging.list;
          if (staged.length) {
            for (const c of staged) cpFiles.push({ path: c.path, content: c.kind === "create" ? null : c.before });
            set((s) => ({
              checkpoints: [{ id: rid(), label: text.slice(0, 60), ts: Date.now(), files: cpFiles }, ...s.checkpoints].slice(0, 12),
              panel: "diff",
              activeDiffPath: staged[0].path,
            }));
            if (get().settings.autoApply) await get().acceptAll();
            else get().toast(`${staged.length} file(s) staged — review the diff`, "info");
          }
        },
      },
    });
  },

  async inlineEditRun(instruction) {
    const st = get();
    const path = st.activeTab;
    if (!path) return;
    const buf = st.buffers[path];
    const sel = st.selection || buf.content;
    set({ inlineEdit: { open: true, busy: true } });
    try {
      const out = await completeOnce(
        st.settings,
        [
          { role: "system", content: INLINE_EDIT_PROMPT },
          { role: "user", content: `File: ${path}\n\nFULL FILE:\n${buf.content.slice(0, 20000)}\n\nSELECTED REGION TO REWRITE:\n${sel}\n\nINSTRUCTION: ${instruction}` },
        ],
        { thinking: false, temperature: 0.3, maxTokens: 4096 },
      );
      const clean = out.replace(/^```[\w]*\n?/, "").replace(/```\s*$/, "");
      const after = st.selection ? buf.content.replace(st.selection, clean) : clean;
      st.staging.stage({ path, kind: "modify", before: buf.disk, after, origin: "inline", ts: Date.now() });
      set({ inlineEdit: { open: false, busy: false }, panel: "diff", activeDiffPath: path, stagingVersion: get().stagingVersion + 1 });
      get().toast("Inline edit staged — review diff", "ok");
    } catch (e: any) {
      set({ inlineEdit: { open: false, busy: false } });
      get().toast(`Inline edit failed: ${e.message}`, "error");
    }
  },

  async acceptChange(path, content) {
    const { fs, staging } = get();
    if (!fs) return;
    const c = staging.get(path);
    if (!c) return;
    try {
      if (c.kind === "delete") await fs.deleteEntry(path);
      else await fs.writeFile(path, content ?? c.after);
      await watcher?.touch(path);
      staging.drop(path);
      const b = get().buffers[path];
      const written = content ?? c.after;
      if (b) {
        set((s) => ({
          buffers: { ...s.buffers, [path]: { ...b, content: written, disk: written, dirty: false, extVersion: b.extVersion + 1, problems: lintSource(path, written) } },
        }));
      }
      if (c.kind !== "delete") {
        get().index.addFile(path, written);
        get().index.finish();
      }
      set((s) => ({ stagingVersion: s.stagingVersion + 1, indexVersion: s.indexVersion + 1 }));
      await get().refreshTree();
      get().toast(`Applied ${basename(path)} to disk`, "ok");
    } catch (e: any) {
      get().toast(`Apply failed: ${e.message}`, "error");
    }
  },

  rejectChange(path) {
    get().staging.drop(path);
    set((s) => ({ stagingVersion: s.stagingVersion + 1, activeDiffPath: s.activeDiffPath === path ? null : s.activeDiffPath }));
  },

  async acceptAll() {
    for (const c of get().staging.list) await get().acceptChange(c.path);
    set({ panel: "chat" });
  },

  rejectAll() {
    get().staging.clear();
    set((s) => ({ stagingVersion: s.stagingVersion + 1, activeDiffPath: null }));
  },

  async restoreCheckpoint(id) {
    const { fs, checkpoints } = get();
    const cp = checkpoints.find((c) => c.id === id);
    if (!fs || !cp) return;
    for (const f of cp.files) {
      if (f.content === null) await fs.deleteEntry(f.path).catch(() => {});
      else await fs.writeFile(f.path, f.content);
      const b = get().buffers[f.path];
      if (b && f.content !== null) {
        set((s) => ({ buffers: { ...s.buffers, [f.path]: { ...b, content: f.content!, disk: f.content!, dirty: false, extVersion: b.extVersion + 1 } } }));
      }
    }
    await get().refreshTree(true);
    get().toast(`Rolled back to “${cp.label}”`, "ok");
  },

  setSettings(p) {
    const next = { ...get().settings, ...p };
    saveSettings(next);
    set({ settings: next });
  },

  setPanel(p) {
    set({ panel: p });
  },
  setDiffPath(p) {
    set({ activeDiffPath: p });
  },
  setPalette(v) {
    set({ paletteOpen: v });
  },
  setInlineEdit(v) {
    set((s) => ({ inlineEdit: { ...s.inlineEdit, ...v } }));
  },
}));

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

async function attach(fs: VFS, set: any, get: () => IdeState) {
  watcher?.stop();
  const tree = await fs.listTree();
  set({ fs, tree, backendLabel: fs.label, fsError: null, buffers: {}, openTabs: [], activeTab: null, externalChanges: [] });
  get().index.clear();

  watcher = new FsWatcher(fs, {
    hotPaths: () => get().openTabs,
    onEvents: async (events: WatchEvent[]) => {
      const paths = [...new Set(events.map((e) => e.path))];
      const s = get();
      let touchedTree = false;
      for (const e of events) {
        if (e.type !== "changed") touchedTree = true;
        const b = s.buffers[e.path];
        if (!b) continue;
        if (e.type === "deleted") continue;
        try {
          const fresh = await fs.readFile(e.path);
          if (fresh === b.content) continue;
          if (!b.dirty) {
            set((st: IdeState) => ({
              buffers: { ...st.buffers, [e.path]: { ...st.buffers[e.path], content: fresh, disk: fresh, extVersion: st.buffers[e.path].extVersion + 1, problems: lintSource(e.path, fresh) } },
            }));
          } else {
            set((st: IdeState) => ({ buffers: { ...st.buffers, [e.path]: { ...st.buffers[e.path], disk: fresh } } }));
            get().toast(`${basename(e.path)} changed on disk — your buffer is dirty`, "error");
          }
        } catch {
          /* ignore */
        }
      }
      set({ externalChanges: paths.slice(0, 12) });
      if (touchedTree) {
        const t = await fs.listTree();
        set({ tree: t });
      }
    },
  });
  await watcher.primeFromTree(tree);
  watcher.start();

  // index in the background
  setTimeout(() => get().reindex(), 60);

  // auto-open a sensible entry file
  const files = flattenFiles(tree);
  const first =
    files.find((f) => /README\.md$/i.test(f.path)) ??
    files.find((f) => /src\/(index|main|app)\.(t|j)sx?$/.test(f.path)) ??
    files[0];
  if (first) get().openFile(first.path);
}

export { executeTool };
