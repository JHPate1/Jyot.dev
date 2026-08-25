import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useIde } from "@/store/ide";

const PRESETS = ["Add types", "Fix errors", "Simplify", "Make it safer", "Add comments"];

export default function InlineEdit() {
  const { inlineEdit, setInlineEdit, inlineEditRun, activeTab, selection } = useIde();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (inlineEdit.open) setTimeout(() => ref.current?.focus(), 10); else setText(""); }, [inlineEdit.open]);

  if (!inlineEdit.open) return null;

  return (
    <div className="absolute left-1/2 top-4 z-30 w-[520px] max-w-[92%] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[#1d2026]/95 shadow-2xl backdrop-blur-xl anim-in">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black"><Sparkles size={14} /></div>
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !inlineEdit.busy) inlineEditRun(text.trim()); if (e.key === "Escape") setInlineEdit({ open: false }); }} disabled={inlineEdit.busy} placeholder={selection ? `Change ${selection.split("\n").length} lines…` : `Describe the change for ${activeTab?.split("/").pop() ?? "this file"}…`} className="flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-slate-500" />
        {inlineEdit.busy ? <span className="text-[12px] text-slate-400">Seeker working…</span> : <button onClick={() => setInlineEdit({ open: false })} className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:text-white"><X size={14} /></button>}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-white/6 px-4 py-2.5">
        {PRESETS.map((p) => <button key={p} onClick={() => setText(p)} disabled={inlineEdit.busy} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11.5px] text-slate-300 hover:bg-white/10 hover:text-white">{p}</button>)}
        <span className="ml-auto self-center text-[11px] text-slate-500">Enter to preview • Esc to close</span>
      </div>
    </div>
  );
}
