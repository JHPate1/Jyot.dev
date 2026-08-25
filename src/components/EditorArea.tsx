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
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#17191e] text-slate-500">
        <div className="rounded-2xl bg-white/5 px-4 py-2 text-[12px]">No file open — choose a file from the left or press ⌘P</div>
        <div className="flex gap-2 text-[11px]"><kbd className="rounded-full bg-white/10 px-2 py-0.5">⌘P</kbd> find files <kbd className="rounded-full bg-white/10 px-2 py-0.5">⌘K</kbd> quick edit</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[#17191e]">
      <div className="flex h-[36px] shrink-0 items-center overflow-x-auto border-b border-white/6 bg-[#121418]">
        {openTabs.map((p) => {
          const b = buffers[p];
          const on = p === activeTab;
          return (
            <div key={p} onClick={() => setActive(p)} className={cn("group relative flex h-full min-w-0 shrink-0 cursor-pointer items-center gap-2 border-r border-white/6 px-4 text-[13px] font-medium", on ? "bg-[#17191e] text-white" : "text-slate-400 hover:bg-white/5 hover:text-white")}>
              {on && <span className="absolute bottom-0 left-0 h-[2px] w-full bg-white" />}
              <span className="max-w-[160px] truncate">{p.split("/").pop()}</span>
              {b?.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              {staging.has(p) && <span className="shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">•</span>}
              <button onClick={(e) => { e.stopPropagation(); closeTab(p); }} className="shrink-0 rounded-full p-1 opacity-0 transition hover:bg-white/10 group-hover:opacity-100"><X size={12} /></button>
            </div>
          );
        })}
      </div>

      <div className="flex h-[28px] shrink-0 items-center gap-1 border-b border-white/5 bg-[#121418] px-3 text-[11.5px] text-slate-400">
        {crumbs.map((c, i) => (<span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight size={10} className="text-slate-600" />}<span className={i === crumbs.length - 1 ? "text-white" : ""}>{c}</span></span>))}
        <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px]">{extOf(activeTab ?? "")}</span>
        {stagedHere && <button onClick={() => { setPanel("diff"); setDiffPath(activeTab); }} className="ml-2 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10.5px] font-medium text-white hover:bg-indigo-500">Review change →</button>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setInlineEdit({ open: true })} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"><Sparkles size={11} /> Quick edit</button>
          <button onClick={() => saveFile()} disabled={!buf?.dirty} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black hover:bg-slate-100 disabled:opacity-30"><Save size={11} /> Save</button>
        </div>
      </div>

      <div className="min-h-0 flex-1">{buf && <CodeEditor path={buf.path} value={buf.content} extVersion={buf.extVersion} onChange={(v) => updateBuffer(buf.path, v)} onSelection={setSelection} onSave={() => saveFile()} onInlineEdit={() => setInlineEdit({ open: true })} onPalette={() => setPalette("files")} />}</div>
      <InlineEdit />
    </div>
  );
}
