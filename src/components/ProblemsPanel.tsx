import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";
import { lintSource } from "@/lib/lint";

export default function ProblemsPanel() {
  const { buffers, openTabs, staging, stagingVersion, openFile } = useIde();
  void stagingVersion;

  const groups = openTabs
    .map((p) => ({ path: p, problems: buffers[p]?.problems ?? lintSource(p, buffers[p]?.content ?? "") }))
    .filter((g) => g.problems.length);

  const staged = staging.list
    .filter((c) => c.kind !== "delete")
    .map((c) => ({ path: c.path + "  (staged)", problems: lintSource(c.path, c.after), real: c.path }))
    .filter((g) => g.problems.length);

  const all = [...groups.map((g) => ({ ...g, real: g.path })), ...staged];
  const count = all.reduce((n, g) => n + g.problems.length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2 text-[12px] text-slate-400">
        <ShieldAlert size={13} /> Problems
        <span className="rounded bg-ink-700 px-1.5 font-mono text-[10px] text-slate-500">{count}</span>
        <span className="ml-auto text-[10px] text-slate-600">structural analyser · staged content included</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!all.length && <div className="px-3 py-10 text-center text-[11.5px] text-slate-600">No problems detected in open or staged files</div>}
        {all.map((g) => (
          <div key={g.path}>
            <div className="sticky top-0 bg-ink-900/95 px-3 py-1 font-mono text-[10.5px] text-slate-500 backdrop-blur">{g.path}</div>
            {g.problems.map((p, i) => (
              <button
                key={i}
                onClick={() => openFile(g.real)}
                className="flex w-full items-start gap-2 px-4 py-1 text-left hover:bg-white/4"
              >
                {p.severity === "error" ? (
                  <AlertTriangle size={11} className="mt-1 shrink-0 text-red-400" />
                ) : p.severity === "warning" ? (
                  <AlertTriangle size={11} className="mt-1 shrink-0 text-amber-400" />
                ) : (
                  <Info size={11} className="mt-1 shrink-0 text-sky-400" />
                )}
                <span className={cn("text-[11.5px]", p.severity === "error" ? "text-red-200" : p.severity === "warning" ? "text-amber-200" : "text-slate-400")}>
                  {p.message}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-700">{p.line}:{p.column}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
