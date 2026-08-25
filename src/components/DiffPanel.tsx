import { useEffect, useMemo, useState } from "react";
import { Check, CheckCheck, FileDiff, History, Undo2, X } from "lucide-react";
import { useIde } from "@/store/ide";
import { applyHunks, diffLines, toHunks, unifiedPatch } from "@/lib/diff";
import { cn } from "@/utils/cn";

export default function DiffPanel() {
  const { staging, stagingVersion, activeDiffPath, setDiffPath, acceptChange, rejectChange, acceptAll, rejectAll, checkpoints, restoreCheckpoint, toast } = useIde();
  void stagingVersion;
  const changes = staging.list;
  const current = changes.find((c) => c.path === activeDiffPath) ?? changes[0];
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const { lines, hunks } = useMemo(() => {
    if (!current) return { lines: [], hunks: [] };
    const l = diffLines(current.before, current.after);
    return { lines: l, hunks: toHunks(l) };
  }, [current?.path, current?.before, current?.after]);

  useEffect(() => { setAccepted(new Set(hunks.map((h) => h.id))); }, [current?.path, hunks.length]);

  const partial = current && accepted.size !== hunks.length;
  const totals = changes.reduce((acc, c) => { const d = diffLines(c.before, c.after); acc.add += d.filter((x) => x.op === "add").length; acc.del += d.filter((x) => x.op === "del").length; return acc; }, { add: 0, del: 0 });

  if (!changes.length) {
    return (
      <div className="flex h-full flex-col bg-[#121418]">
        <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2.5 text-[13px] font-medium text-white"><FileDiff size={15} /> Review Changes</div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">✓</div>
          <div className="text-[14px] font-medium text-white">All clear</div>
          <p className="max-w-[260px] text-[12.5px] leading-relaxed text-slate-400">When Seeker suggests edits, they appear here first. You choose what to save.</p>
        </div>
        {!!checkpoints.length && <Checkpoints list={checkpoints} restore={restoreCheckpoint} />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#121418]">
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2.5">
        <FileDiff size={15} className="text-indigo-400" />
        <span className="text-[13px] font-medium text-white">{changes.length} file{changes.length > 1 ? "s" : ""} changed</span>
        <span className="font-mono text-[11px] text-emerald-400">+{totals.add}</span>
        <span className="font-mono text-[11px] text-red-400">-{totals.del}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={rejectAll} className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-slate-300 hover:bg-white/5">Discard all</button>
          <button onClick={acceptAll} className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-black hover:bg-slate-100"><CheckCheck size={14} /> Save all</button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-white/6 px-3 py-2">
        {changes.map((c) => {
          const d = diffLines(c.before, c.after);
          return (
            <button key={c.path} onClick={() => setDiffPath(c.path)} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition", current?.path === c.path ? "border-white bg-white text-black" : "border-white/10 bg-[#17191e] text-slate-400 hover:text-white")}>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase", c.kind === "create" ? "bg-emerald-500 text-white" : c.kind === "delete" ? "bg-red-500 text-white" : "bg-indigo-500 text-white")}>{c.kind === "create" ? "NEW" : c.kind === "delete" ? "DEL" : "EDIT"}</span>
              <span>{c.path.split("/").pop()}</span>
              <span className="font-mono text-[10px] opacity-70">+{d.filter((x) => x.op === "add").length} -{d.filter((x) => x.op === "del").length}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <>
          <div className="flex items-center gap-2 border-b border-white/6 bg-[#0d0e12]/60 px-4 py-2">
            <span className="truncate font-mono text-[12px] text-white">{current.path}</span>
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => navigator.clipboard.writeText(unifiedPatch(current.path, current.before, current.after)).then(() => toast("Copied to clipboard", "ok"))} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/5">Copy</button>
              <button onClick={() => rejectChange(current.path)} className="flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/15"><X size={12} /> Discard</button>
              <button onClick={() => acceptChange(current.path, partial ? applyHunks(current.before, lines, accepted, hunks) : undefined)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black hover:bg-slate-100"><Check size={12} /> {partial ? `Save ${accepted.size} parts` : "Save file"}</button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#0d0e12] font-mono text-[12px] leading-[1.6]">
            {current.kind === "delete" ? <div className="p-4 text-[13px] text-red-300">This file will be removed when you save.</div> : hunks.map((h) => {
              const on = accepted.has(h.id);
              return (
                <div key={h.id} className={cn("border-b border-white/5", !on && "opacity-40")}>
                  <div className="flex items-center gap-2 bg-[#17191e] px-4 py-1.5">
                    <span className="text-[11px] text-slate-400">Section starting at line {h.bStart}</span>
                    <span className="text-[11px] text-emerald-400">+{h.added}</span>
                    <span className="text-[11px] text-red-400">-{h.removed}</span>
                    <button onClick={() => setAccepted((s) => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })} className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium", on ? "bg-indigo-600 text-white" : "bg-white/10 text-slate-300")}>{on ? "Included" : "Excluded"}</button>
                  </div>
                  {h.lines.map((l, i) => (
                    <div key={i} className={cn("flex whitespace-pre", l.op === "add" && "bg-emerald-500/10", l.op === "del" && "bg-red-500/10")}>
                      <span className="w-12 shrink-0 select-none pr-2 text-right text-[11px] text-slate-600">{l.aLine ?? ""}</span>
                      <span className="w-12 shrink-0 select-none pr-2 text-right text-[11px] text-slate-600">{l.bLine ?? ""}</span>
                      <span className={cn("w-5 shrink-0 select-none text-center", l.op === "add" ? "text-emerald-400" : l.op === "del" ? "text-red-400" : "text-slate-600")}>{l.op === "add" ? "+" : l.op === "del" ? "-" : " "}</span>
                      <span className={cn("min-w-0 flex-1 pr-4", l.op === "add" ? "text-emerald-200" : l.op === "del" ? "text-red-200" : "text-slate-400")}>{l.text || " "}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!!checkpoints.length && <Checkpoints list={checkpoints} restore={restoreCheckpoint} />}
    </div>
  );
}

function Checkpoints({ list, restore }: { list: any[]; restore: (id: string) => void }) {
  return (
    <div className="border-t border-white/6 bg-[#121418]">
      <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-500"><History size={12} /> Undo history</div>
      <div className="max-h-28 overflow-y-auto pb-1">
        {list.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 px-4 py-1.5 text-[12px] text-slate-400 hover:bg-white/[0.04]">
            <span className="truncate">{c.label || "Seeker edit"}</span>
            <span className="ml-auto shrink-0 text-[11px] text-slate-500">{c.files.length} file(s)</span>
            <button onClick={() => restore(c.id)} className="shrink-0 rounded-full bg-white/10 p-1 text-slate-400 opacity-0 hover:text-white group-hover:opacity-100" title="Undo"><Undo2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
