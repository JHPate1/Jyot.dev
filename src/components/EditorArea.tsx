import { useMemo } from "react";
import { ChevronRight, Save, Sparkles, X } from "lucide-react";
import { useIde } from "@/store/ide";
import CodeEditor from "./editor/CodeEditor";
import InlineEdit from "./InlineEdit";
import { cn } from "@/utils/cn";
import { extOf } from "@/lib/fs/types";

export default function EditorArea() {
  const { openTabs, activeTab, buffers, setActive, closeTab, updateBuffer, saveFile, setSelection, setInlineEdit, setPalette, staging, stagingVersion, setPanel, setDiffPath } = useIde();
  void stagingVersion;
  const buf = activeTab ? buffers[activeTab] : null;
  const crumbs = useMemo(() => (activeTab ? activeTab.split("/") : []), [activeTab]);
  const stagedHere = activeTab ? staging.has(activeTab) : false;

  if (!openTabs.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-700">
        <div className="font-mono text-[11px]">no file open</div>
        <div className="flex gap-2 text-[10.5px]">
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5">⌘P</kbd> files
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5">⌘K</kbd> inline edit
          <kbd className="rounded bg-ink-800 px-1.5 py-0.5">⌘⇧P</kbd> commands
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* tabs */}
      <div className="flex h-[32px] shrink-0 items-center overflow-x-auto border-b border-white/6 bg-ink-900/70">
        {openTabs.map((p) => {
          const b = buffers[p];
          const on = p === activeTab;
          return (
            <div
              key={p}
              onClick={() => setActive(p)}
              className={cn(
                "group relative flex h-full min-w-0 shrink-0 cursor-pointer items-center gap-1.5 border-r border-white/6 px-3 text-[11.5px]",
                on ? "bg-ink-850 text-slate-100" : "text-slate-500 hover:bg-white/3 hover:text-slate-300",
              )}
            >
              {on && <span className="absolute left-0 top-0 h-[2px] w-full bg-nv-500" />}
              <span className="max-w-[160px] truncate">{p.split("/").pop()}</span>
              {b?.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              {staging.has(p) && <span className="shrink-0 rounded bg-nv-500/20 px-1 font-mono text-[9px] text-nv-300">±</span>}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(p); }}
                className="shrink-0 rounded p-0.5 opacity-0 transition hover:bg-white/10 group-hover:opacity-100"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      {/* breadcrumb */}
      <div className="flex h-[24px] shrink-0 items-center gap-1 border-b border-white/5 px-3 text-[10.5px] text-slate-600">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={9} className="text-slate-700" />}
            <span className={i === crumbs.length - 1 ? "text-slate-400" : ""}>{c}</span>
          </span>
        ))}
        <span className="ml-2 rounded bg-ink-800 px-1.5 font-mono text-[9px] text-slate-600">{extOf(activeTab ?? "")}</span>
        {stagedHere && (
          <button onClick={() => { setPanel("diff"); setDiffPath(activeTab); }} className="ml-2 rounded bg-nv-500/15 px-1.5 font-mono text-[9px] text-nv-300 hover:bg-nv-500/25">
            staged diff →
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setInlineEdit({ open: true })} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-white/6 hover:text-nv-300" title="Inline AI edit (⌘K)">
            <Sparkles size={10} /> ⌘K
          </button>
          <button onClick={() => saveFile()} disabled={!buf?.dirty} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-white/6 hover:text-slate-200 disabled:opacity-30" title="Save (⌘S)">
            <Save size={10} /> ⌘S
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {buf && (
          <CodeEditor
            path={buf.path}
            value={buf.content}
            extVersion={buf.extVersion}
            onChange={(v) => updateBuffer(buf.path, v)}
            onSelection={setSelection}
            onSave={() => saveFile()}
            onInlineEdit={() => setInlineEdit({ open: true })}
            onPalette={() => setPalette("files")}
          />
        )}
      </div>
      <InlineEdit />
    </div>
  );
}
