import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Check, FileDiff, FolderTree, Search, Settings2, ShieldAlert, Sparkles, Users, X,
} from "lucide-react";
import { useIde, type PanelTab } from "@/store/ide";
import FileTree from "@/components/FileTree";
import EditorArea from "@/components/EditorArea";
import ChatPanel from "@/components/ChatPanel";
import SwarmPanel from "@/components/SwarmPanel";
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
  { id: "chat", icon: Sparkles, label: "Seeker Pro 1.2" },
  { id: "swarm", icon: Users, label: "Team" },
  { id: "diff", icon: FileDiff, label: "Review" },
  { id: "search", icon: Search, label: "Search" },
  { id: "problems", icon: ShieldAlert, label: "Issues" },
  { id: "blueprint", icon: BookOpen, label: "Guide" },
];

export default function App() {
  const s = useIde();
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const left = useDrag(240, 180, 420);
  const right = useDrag(420, 320, 720, true);

  useEffect(() => { s.boot(); }, []);

  const commands: Command[] = useMemo(
    () => [
      { id: "open", label: "Open folder on your computer…", run: () => s.connectLocal() },
      { id: "demo", label: "Open sample project", run: () => s.useDemo() },
      { id: "save", label: "Save current file", run: () => s.saveFile() },
      { id: "saveall", label: "Save all files", run: () => s.saveAll() },
      { id: "new", label: "New file…", run: () => { const n = prompt("File name:", "src/new-file.ts"); if (n) s.createEntry(n, "file"); } },
      { id: "team", label: "Start Seeker team on a task…", run: () => s.setPanel("swarm") },
      { id: "settings", label: "Open settings (API key)…", run: () => setShowSettings(true) },
      { id: "sidebar", label: "Toggle file list", run: () => setShowSidebar((v) => !v) },
      ...PANELS.map((p) => ({ id: `panel-${p.id}`, label: `Show ${p.label}`, run: () => s.setPanel(p.id) })),
    ],
    [s.connectLocal, s.useDemo, s.saveFile, s.saveAll, s.createEntry, s.setPanel],
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); useIde.getState().setPalette("commands"); }
      else if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); useIde.getState().setPalette("files"); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); useIde.getState().saveFile(); }
      else if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); useIde.getState().setInlineEdit({ open: true }); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); setShowSidebar((v) => !v); }
      else if (mod && e.key === "Enter") { e.preventDefault(); useIde.getState().acceptAll(); }
      else if (e.key === "Escape") { useIde.getState().setPalette(false); }
    },
    [],
  );

  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const st = useIde.getState();
      if (Object.values(st.buffers).some((b) => b.dirty) || st.staging.size) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const Panel = { chat: ChatPanel, swarm: SwarmPanel, diff: DiffPanel, search: SearchPanel, problems: ProblemsPanel, blueprint: BlueprintPanel }[s.panel];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0d0e12]">
      <div className="flex h-[44px] shrink-0 items-center gap-3 border-b border-white/6 bg-[#121418] px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black font-bold text-[13px]">S</div>
          <span className="text-[14px] font-semibold tracking-tight text-white">Seeker Code</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">Seeker Pro 1.2</span>
        </div>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <button onClick={() => setShowSidebar((v) => !v)} className={cn("rounded-lg p-2 transition", showSidebar ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")} title="Toggle file list">
          <FolderTree size={16} />
        </button>
        <button onClick={() => useIde.getState().setPalette("commands")} className="flex items-center gap-2.5 rounded-full border border-white/10 bg-[#1d2026] px-3.5 py-1.5 text-[12.5px] text-slate-300 hover:bg-white/10 hover:text-white">
          <Search size={14} /> Search files or ask…
          <kbd className="ml-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">⌘P</kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {!!s.staging.size && (
            <button onClick={() => s.setPanel("diff")} className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500">
              <FileDiff size={14} /> {s.staging.size} to review
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Settings — API key">
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {!s.fs ? (
        s.panel === "blueprint" ? <div className="min-h-0 flex-1"><BlueprintPanel /></div> : <div className="min-h-0 flex-1"><Welcome /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {showSidebar && (
            <>
              <div style={{ width: left.size }} className="shrink-0 border-r border-white/6 bg-[#121418]">
                <FileTree />
              </div>
              <div onMouseDown={left.onMouseDown} className="w-[3px] shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40" />
            </>
          )}
          <div className="min-w-0 flex-1 bg-[#17191e]"><EditorArea /></div>
          <div onMouseDown={right.onMouseDown} className="w-[3px] shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40" />
          <div style={{ width: right.size }} className="flex shrink-0 flex-col border-l border-white/6 bg-[#121418]">
            <div className="flex shrink-0 items-center gap-1 border-b border-white/6 px-2 py-1.5">
              {PANELS.map((p) => (
                <button key={p.id} onClick={() => s.setPanel(p.id)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition", s.panel === p.id ? "bg-white text-black" : "text-slate-400 hover:bg-white/5 hover:text-white")}>
                  <p.icon size={13} /> {p.label}
                  {p.id === "diff" && !!s.staging.size && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{s.staging.size}</span>}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1"><Panel /></div>
          </div>
        </div>
      )}

      <StatusBar />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <CommandPalette commands={commands} />

      <div className="pointer-events-none fixed bottom-8 right-4 z-50 flex w-80 flex-col gap-2">
        {s.toasts.map((t) => (
          <div key={t.id} className={cn("pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] shadow-2xl backdrop-blur anim-in", t.kind === "error" ? "border-red-500/30 bg-[#1f1515] text-red-200" : "border-white/10 bg-[#1d2026] text-white")}>
            <Check size={16} className={cn("mt-0.5 shrink-0", t.kind === "error" ? "text-red-400" : "text-emerald-400")} />
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button onClick={() => useIde.setState((st) => ({ toasts: st.toasts.filter((x) => x.id !== t.id) }))} className="shrink-0 text-slate-500 hover:text-white"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
