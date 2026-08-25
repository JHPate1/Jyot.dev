import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Check, Code2, FileDiff, FolderTree, Search, Settings2, ShieldAlert, Terminal, TriangleAlert, X,
} from "lucide-react";
import { useIde, type PanelTab } from "@/store/ide";
import FileTree from "@/components/FileTree";
import EditorArea from "@/components/EditorArea";
import ChatPanel from "@/components/ChatPanel";
import DiffPanel from "@/components/DiffPanel";
import SearchPanel from "@/components/SearchPanel";
import ProblemsPanel from "@/components/ProblemsPanel";
import BlueprintPanel from "@/components/BlueprintPanel";
import SettingsModal from "@/components/SettingsModal";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import StatusBar from "@/components/StatusBar";
import Welcome from "@/components/Welcome";
import { cn } from "@/utils/cn";

function useDrag(initial: number, min: number, max: number, invert = false) {
  const [size, setSize] = useState(initial);
  const dragging = useRef(false);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const v = invert ? window.innerWidth - e.clientX : e.clientX;
      setSize(Math.min(max, Math.max(min, v)));
    };
    const up = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [min, max, invert]);
  const onMouseDown = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  return { size, onMouseDown };
}

const PANELS: { id: PanelTab; icon: any; label: string }[] = [
  { id: "chat", icon: Terminal, label: "Assistant" },
  { id: "diff", icon: FileDiff, label: "Review Changes" },
  { id: "search", icon: Search, label: "Search" },
  { id: "problems", icon: ShieldAlert, label: "Issues" },
  { id: "blueprint", icon: BookOpen, label: "Guide" },
];

export default function App() {
  const s = useIde();
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const left = useDrag(224, 160, 420);
  const right = useDrag(400, 300, 720, true);

  useEffect(() => {
    s.boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commands: Command[] = useMemo(
    () => [
      { id: "open", label: "File: Open Folder on Computer…", run: () => s.connectLocal() },
      { id: "opfs", label: "File: Open Private Browser Folder", run: () => s.useOPFS() },
      { id: "demo", label: "File: Open Sample Project", run: () => s.useDemo() },
      { id: "disconnect", label: "File: Close Project Folder", run: () => s.disconnect() },
      { id: "reindex", label: "Search: Refresh Project Search", run: () => s.refreshTree(true) },
      { id: "save", label: "File: Save Current File (⌘S)", run: () => s.saveFile() },
      { id: "saveall", label: "File: Save All Modified Files", run: () => s.saveAll() },
      { id: "new", label: "File: New File…", run: () => { const n = prompt("New file name:", "src/new-file.ts"); if (n) s.createEntry(n, "file"); } },
      { id: "inline", label: "Edit: Quick Edit Selected Lines (⌘K)", run: () => s.setInlineEdit({ open: true }) },
      { id: "agent", label: "Assistant: Toggle Code Editing Mode", run: () => s.setAgentMode(!s.agentMode) },
      { id: "explain", label: "Assistant: Explain Open File", run: () => s.send("Explain what this file does in simple, clear terms.") },
      { id: "bugs", label: "Assistant: Check Project for Bugs", run: () => s.send("Inspect the project for potential bugs or broken code.") },
      { id: "tests", label: "Assistant: Write Unit Tests", run: () => s.send("Write unit tests for the active file.") },
      { id: "applyall", label: "Changes: Save All Proposed Changes", run: () => s.acceptAll() },
      { id: "discardall", label: "Changes: Discard All Proposed Changes", run: () => s.rejectAll() },
      { id: "settings", label: "Preferences: Open Settings…", run: () => setShowSettings(true) },
      { id: "sidebar", label: "View: Toggle Sidebar", run: () => setShowSidebar((v) => !v) },
      ...PANELS.map((p) => ({ id: `panel-${p.id}`, label: `View: Show ${p.label} Panel`, run: () => s.setPanel(p.id) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.agentMode],
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useIde.getState().setPalette("commands");
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useIde.getState().setPalette("files");
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        useIde.getState().saveFile();
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useIde.getState().setInlineEdit({ open: true });
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setShowSidebar((v) => !v);
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        useIde.getState().acceptAll();
      } else if (e.key === "Escape") {
        useIde.getState().setPalette(false);
      }
    },
    [],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const st = useIde.getState();
      if (Object.values(st.buffers).some((b) => b.dirty) || st.staging.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const Panel = { chat: ChatPanel, diff: DiffPanel, search: SearchPanel, problems: ProblemsPanel, blueprint: BlueprintPanel }[s.panel];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      {/* top bar */}
      <div className="flex h-[38px] shrink-0 items-center gap-2 border-b border-white/6 bg-ink-900 px-3">
        <div className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-ink-800 text-nv-400">
          <Code2 size={13} />
        </div>
        <span className="text-[13.5px] font-semibold tracking-tight text-slate-100">Kode</span>
        <span className="rounded border border-white/8 bg-ink-850 px-1.5 py-0.5 text-[10px] text-slate-400">Local Files</span>

        <div className="mx-2 h-3.5 w-px bg-white/8" />

        <button
          onClick={() => setShowSidebar((v) => !v)}
          className={cn("rounded p-1 transition", showSidebar ? "text-slate-300" : "text-slate-500 hover:text-slate-300")}
          title="Toggle Folder Sidebar (⌘B)"
        >
          <FolderTree size={14} />
        </button>
        <button
          onClick={() => useIde.getState().setPalette("commands")}
          className="flex items-center gap-2 rounded-md border border-white/8 bg-ink-850 px-2.5 py-1 text-[11.5px] text-slate-300 hover:border-white/16 hover:text-white"
        >
          <Search size={12} /> Search files or actions
          <kbd className="rounded bg-ink-700 px-1 font-mono text-[9.5px] text-slate-400">⌘P</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {!!s.staging.size && (
            <button
              onClick={() => s.setPanel("diff")}
              className="flex items-center gap-1.5 rounded-md bg-nv-500/15 px-2.5 py-1 text-[11.5px] font-medium text-nv-300 hover:bg-nv-500/25"
            >
              <FileDiff size={12} /> {s.staging.size} pending change{s.staging.size > 1 ? "s" : ""}
            </button>
          )}
          {s.settings.autoApply && (
            <span className="flex items-center gap-1 rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-300" title="Changes save directly to disk">
              <TriangleAlert size={11} /> Auto-save changes
            </span>
          )}
          <button onClick={() => setShowSettings(true)} className="rounded p-1.5 text-slate-400 hover:bg-white/6 hover:text-slate-200" title="Settings">
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {/* main area */}
      {!s.fs ? (
        s.panel === "blueprint" ? (
          <div className="min-h-0 flex-1">
            <BlueprintPanel />
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <Welcome />
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1">
          {showSidebar && (
            <>
              <div style={{ width: left.size }} className="shrink-0 border-r border-white/6 bg-ink-900/60">
                <FileTree />
              </div>
              <div onMouseDown={left.onMouseDown} className="w-[3px] shrink-0 cursor-col-resize bg-transparent transition hover:bg-nv-500/40" />
            </>
          )}

          <div className="min-w-0 flex-1 bg-ink-850">
            <EditorArea />
          </div>

          <div onMouseDown={right.onMouseDown} className="w-[3px] shrink-0 cursor-col-resize bg-transparent transition hover:bg-nv-500/40" />

          <div style={{ width: right.size }} className="flex shrink-0 flex-col border-l border-white/6 bg-ink-900/60">
            <div className="flex shrink-0 items-center gap-0.5 border-b border-white/6 px-1.5 py-1">
              {PANELS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => s.setPanel(p.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition",
                    s.panel === p.id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/4 hover:text-slate-200",
                  )}
                >
                  <p.icon size={12} />
                  {p.label}
                  {p.id === "diff" && !!s.staging.size && <span className="rounded bg-nv-500/20 px-1.5 font-mono text-[9.5px] text-nv-300">{s.staging.size}</span>}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <Panel />
            </div>
          </div>
        </div>
      )}

      <StatusBar />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <CommandPalette commands={commands} />

      {/* notifications */}
      <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-72 flex-col gap-1.5">
        {s.toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12px] shadow-xl backdrop-blur anim-in",
              t.kind === "error"
                ? "border-red-500/30 bg-red-950/85 text-red-200"
                : t.kind === "ok"
                  ? "border-white/12 bg-ink-800/95 text-slate-100"
                  : "border-white/12 bg-ink-800/95 text-slate-300",
            )}
          >
            {t.kind === "ok" ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" /> : t.kind === "error" ? <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-400" /> : <Terminal size={14} className="mt-0.5 shrink-0 text-nv-400" />}
            <span className="flex-1">{t.msg}</span>
            <button onClick={() => useIde.setState((st) => ({ toasts: st.toasts.filter((x) => x.id !== t.id) }))} className="shrink-0 opacity-50 hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
