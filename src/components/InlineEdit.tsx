import { useEffect, useRef, useState } from "react";
import { Terminal, X } from "lucide-react";
import { useIde } from "@/store/ide";

const PRESETS = ["Add type definitions", "Handle error cases", "Simplify function", "Convert to async/await", "Add null checks"];

export default function InlineEdit() {
  const { inlineEdit, setInlineEdit, inlineEditRun, activeTab, selection } = useIde();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inlineEdit.open) setTimeout(() => ref.current?.focus(), 10);
    else setText("");
  }, [inlineEdit.open]);

  if (!inlineEdit.open) return null;

  return (
    <div className="absolute left-1/2 top-4 z-30 w-[520px] max-w-[92%] -translate-x-1/2 overflow-hidden rounded-lg border border-white/14 bg-ink-850/95 shadow-2xl backdrop-blur-xl anim-in">
      <div className="flex items-center gap-2 px-3 py-2">
        <Terminal size={14} className="shrink-0 text-slate-400" />
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim() && !inlineEdit.busy) inlineEditRun(text.trim());
            if (e.key === "Escape") setInlineEdit({ open: false });
          }}
          disabled={inlineEdit.busy}
          placeholder={selection ? `Transform ${selection.split("\n").length} selected lines…` : `Modify ${activeTab?.split("/").pop() ?? "file"}…`}
          className="flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
        />
        {inlineEdit.busy ? (
          <span className="font-mono text-[11px] text-slate-400">working...</span>
        ) : (
          <button onClick={() => setInlineEdit({ open: false })} className="rounded p-0.5 text-slate-500 hover:text-slate-200">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-white/6 px-3 py-1.5">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setText(p)} disabled={inlineEdit.busy} className="rounded border border-white/8 px-2 py-0.5 text-[10.5px] text-slate-400 hover:border-white/20 hover:text-slate-200">
            {p}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[9.5px] text-slate-500">Enter to stage · Esc to close</span>
      </div>
    </div>
  );
}
