import { useEffect, useMemo, useState } from "react";
import { Check, CheckCheck, FileDiff, GitCommitHorizontal, History, Undo2, X } from "lucide-react";
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

  useEffect(() => {
    setAccepted(new Set(hunks.map((h) => h.id)));
  }, [current?.path, hunks.length]);

  const partial = current && accepted.size !== hunks.length;
  const totals = changes.reduce(
    (acc, c) => {
      const d = diffLines(c.before, c.after);
      acc.add += d.filter((x) => x.op === "add").length;
      acc.del += d.filter((x) => x.op === "del").length;
      return acc;
    },
    { add: 0, del: 0 },
  );

  if (!changes.length) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2 text-[12.5px] font-medium text-slate-300">
          <FileDiff size={14} /> Pending Changes
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800">
            <GitCommitHorizontal size={18} className="text-slate-500" />
          </div>
          <div className="text-[13px] font-medium text-slate-300">No pending changes</div>
          <p className="max-w-[250px] text-[12px] leading-relaxed text-slate-400">
            When the assistant suggests code edits, they appear here first so you can review and accept them.
          </p>
        </div>
        {!!checkpoints.length && <Checkpoints list={checkpoints} restore={restoreCheckpoint} />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
        <FileDiff size={14} className="text-nv-400" />
        <span className="text-[12.5px] font-medium text-slate-200">{changes.length} file{changes.length > 1 ? "s" : ""} changed</span>
        <span className="font-mono text-[11px] text-emerald-400">+{totals.add}</span>
        <span className="font-mono text-[11px] text-red-400">−{totals.del}</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={rejectAll} className="rounded-md px-2.5 py-1 text-[11.5px] text-slate-400 hover:bg-white/6 hover:text-red-300">
            Discard All
          </button>
          <button onClick={acceptAll} className="flex items-center gap-1 rounded-md bg-nv-500 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-nv-400">
            <CheckCheck size={13} /> Save All Changes
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/6 px-2 py-1.5">
        {changes.map((c) => {
          const d = diffLines(c.before, c.after);
          const a = d.filter((x) => x.op === "add").length;
          const r = d.filter((x) => x.op === "del").length;
          return (
            <button
              key={c.path}
              onClick={() => setDiffPath(c.path)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] transition",
                current?.path === c.path ? "border-nv-500/40 bg-nv-500/15 text-slate-100" : "border-white/8 bg-ink-850 text-slate-400 hover:text-slate-200",
              )}
            >
              <span className={cn("rounded px-1.5 py-0.2 font-mono text-[9.5px] uppercase", c.kind === "create" ? "bg-emerald-500/20 text-emerald-300" : c.kind === "delete" ? "bg-red-500/20 text-red-300" : "bg-sky-500/20 text-sky-300")}>
                {c.kind === "create" ? "NEW" : c.kind === "delete" ? "DEL" : "EDIT"}
              </span>
              <span className="font-mono">{c.path.split("/").pop()}</span>
              <span className="font-mono text-[10px] text-emerald-400">+{a}</span>
              <span className="font-mono text-[10px] text-red-400">−{r}</span>
            </button>
          );
        })}
      </div>

      {current && (
        <>
          <div className="flex items-center gap-2 border-b border-white/6 bg-ink-900/60 px-3 py-1.5">
            <span className="truncate font-mono text-[11.5px] text-slate-300">{current.path}</span>
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={() => navigator.clipboard.writeText(unifiedPatch(current.path, current.before, current.after)).then(() => toast("Patch copied to clipboard", "ok"))}
                className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-white/6 hover:text-slate-200"
              >
                Copy patch
              </button>
              <button onClick={() => rejectChange(current.path)} className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-500/12 hover:text-red-300">
                <X size={12} /> Discard file
              </button>
              <button
                onClick={() => acceptChange(current.path, partial ? applyHunks(current.before, lines, accepted, hunks) : undefined)}
                className="flex items-center gap-1 rounded bg-nv-500/20 px-2.5 py-0.5 text-[11px] font-medium text-nv-300 hover:bg-nv-500/30"
              >
                <Check size={12} /> Save {partial ? `${accepted.size} selected section(s)` : "file"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-ink-950/40 font-mono text-[11.5px] leading-[1.58]">
            {current.kind === "delete" ? (
              <div className="p-4 text-[12.5px] text-red-300">This file will be deleted when you click Save.</div>
            ) : (
              hunks.map((h) => {
                const on = accepted.has(h.id);
                return (
                  <div key={h.id} className={cn("border-b border-white/6", !on && "opacity-45")}>
                    <div className="flex items-center gap-2 bg-ink-800/70 px-3 py-1.5">
                      <span className="text-[10.5px] text-slate-400">Lines {h.bStart} to {h.bStart + h.lines.length}</span>
                      <span className="text-[10.5px] text-emerald-400">+{h.added}</span>
                      <span className="text-[10.5px] text-red-400">−{h.removed}</span>
                      <button
                        onClick={() =>
                          setAccepted((s) => {
                            const n = new Set(s);
                            n.has(h.id) ? n.delete(h.id) : n.add(h.id);
                            return n;
                          })
                        }
                        className={cn("ml-auto rounded px-2 py-0.5 text-[11px] transition", on ? "bg-nv-500/20 text-nv-300" : "bg-ink-700 text-slate-400 hover:text-slate-200")}
                      >
                        {on ? "Included ✓" : "Excluded"}
                      </button>
                    </div>
                    {h.lines.map((l, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex whitespace-pre",
                          l.op === "add" && "bg-emerald-500/12",
                          l.op === "del" && "bg-red-500/12",
                        )}
                      >
                        <span className="w-11 shrink-0 select-none pr-2 text-right text-[10.5px] text-slate-600">{l.aLine ?? ""}</span>
                        <span className="w-11 shrink-0 select-none pr-2 text-right text-[10.5px] text-slate-600">{l.bLine ?? ""}</span>
                        <span className={cn("w-4 shrink-0 select-none", l.op === "add" ? "text-emerald-400" : l.op === "del" ? "text-red-400" : "text-slate-600")}>
                          {l.op === "add" ? "+" : l.op === "del" ? "−" : " "}
                        </span>
                        <span className={cn("min-w-0 flex-1 pr-3", l.op === "add" ? "text-emerald-200" : l.op === "del" ? "text-red-200" : "text-slate-400")}>
                          {l.text || " "}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
      {!!checkpoints.length && <Checkpoints list={checkpoints} restore={restoreCheckpoint} />}
    </div>
  );
}

function Checkpoints({ list, restore }: { list: any[]; restore: (id: string) => void }) {
  return (
    <div className="border-t border-white/6">
      <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <History size={12} /> Undo History
      </div>
      <div className="max-h-28 overflow-y-auto pb-1">
        {list.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-slate-400 hover:bg-white/4">
            <span className="truncate">{c.label || "AI edit"}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{c.files.length} file(s)</span>
            <button onClick={() => restore(c.id)} className="shrink-0 rounded px-1.5 py-0.5 text-slate-400 opacity-0 hover:bg-white/10 hover:text-amber-300 group-hover:opacity-100" title="Undo all changes from this step">
              <Undo2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
