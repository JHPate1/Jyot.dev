import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";
import { lintSource } from "@/lib/lint";

export default function ProblemsPanel() {
  const { buffers, openTabs, staging, stagingVersion, openFile } = useIde();
  void stagingVersion;

  const groups = openTabs.map((p) => ({ path: p, problems: buffers[p]?.problems ?? lintSource(p, buffers[p]?.content ?? "") })).filter((g) => g.problems.length);
  const staged = staging.list.filter((c) => c.kind !== "delete").map((c) => ({ path: c.path + " (proposed)", problems: lintSource(c.path, c.after), real: c.path })).filter((g) => g.problems.length);
  const all = [...groups.map((g) => ({ ...g, real: g.path })), ...staged];
  const count = all.reduce((n, g) => n + g.problems.length, 0);

  return (
    <div className="flex h-full flex-col bg-[#121418]">
      <div className="flex items-center gap-2 border-b border-white/6 px-4 py-2.5 text-[13px] font-medium text-white">
        <ShieldCheck size={14} /> Issues <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!all.length && <div className="px-4 py-12 text-center text-[13px] text-slate-500">No issues found in open files</div>}
        {all.map((g) => (
          <div key={g.path}>
            <div className="sticky top-0 bg-[#121418]/95 px-4 py-1.5 font-mono text-[11px] text-slate-400 backdrop-blur">{g.path}</div>
            {g.problems.map((p, i) => (
              <button key={i} onClick={() => openFile(g.real)} className="flex w-full items-start gap-2.5 px-5 py-1.5 text-left hover:bg-white/[0.04]">
                {p.severity === "error" ? <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-400" /> : p.severity === "warning" ? <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" /> : <Info size={12} className="mt-0.5 shrink-0 text-slate-400" />}
                <span className={cn("text-[12px]", p.severity === "error" ? "text-red-200" : p.severity === "warning" ? "text-amber-200" : "text-slate-400")}>{p.message}</span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-slate-600">{p.line}:{p.column}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
