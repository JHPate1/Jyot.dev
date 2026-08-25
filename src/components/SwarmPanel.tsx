import { useEffect, useRef, useState } from "react";
import { ChevronDown, Hammer, Sparkles, Square, Users } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";
import { Markdown } from "./Markdown";
import { AGENT_BY_ID } from "@/lib/ai/models";
import type { SwarmEntry } from "@/lib/ai/swarm";

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  idle: { label: "Waiting", cls: "text-slate-500", dot: "bg-slate-600" },
  planning: { label: "Planning", cls: "text-indigo-300", dot: "bg-indigo-400 animate-pulse" },
  working: { label: "Working", cls: "text-emerald-300", dot: "bg-emerald-400 animate-pulse" },
  done: { label: "Done", cls: "text-white", dot: "bg-white" },
  error: { label: "Needs attention", cls: "text-amber-300", dot: "bg-amber-400" },
};

function AgentCard({ entry, color, label, role, short }: { entry: SwarmEntry; color: string; label: string; role: string; short: string }) {
  const [open, setOpen] = useState(true);
  const status = STATUS[entry.status] ?? STATUS.idle;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [entry.text, open]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#121418]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white" style={{ background: color }}>{short}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white">{label}</span>
            <span className={cn("flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[10.5px]", status.cls)}><span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />{status.label}</span>
          </div>
          <div className="truncate text-[11.5px] text-slate-400">{role}</div>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-white/6 px-4 py-3">
          {entry.file && <div className="mb-2 font-mono text-[11px] text-slate-300">Editing {entry.file}</div>}
          {entry.note && <div className="mb-2 text-[12px] text-slate-300">{entry.note}</div>}
          {!!entry.tools.length && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {entry.tools.slice(-6).map((t, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300"><Hammer size={11} />{t.call.tool}</span>
              ))}
            </div>
          )}
          {!!entry.text && <div ref={ref} className="max-h-36 overflow-y-auto rounded-xl bg-[#0d0e12] px-3 py-2.5"><Markdown src={entry.text.slice(-2500)} /></div>}
          {!entry.text && !entry.file && entry.status === "idle" && <div className="text-[12px] text-slate-500">Waiting for Seeker Pro 1.2 to assign work…</div>}
        </div>
      )}
    </div>
  );
}

export default function SwarmPanel() {
  const { swarmRunning, swarmPlanSummary, swarmEntries, agents, startSwarm, stopSwarm, staging, setPanel, stagingVersion } = useIde();
  const [task, setTask] = useState("");
  void stagingVersion;
  const roster = agents.filter((a) => a.enabled || a.isArchitect);
  const entryBy = new Map(swarmEntries.map((e) => [e.agentId, e]));

  const launch = () => {
    const t = task.trim();
    if (!t || swarmRunning) return;
    setTask("");
    startSwarm(t);
  };

  return (
    <div className="flex h-full flex-col bg-[#121418]">
      <div className="flex items-center gap-2.5 border-b border-white/6 px-4 py-3">
        <Users size={16} className="text-indigo-400" />
        <span className="text-[13px] font-semibold text-white">Seeker Team</span>
        <span className="text-[12px] text-slate-400">· {roster.length} assistants working together</span>
        {swarmRunning && <button onClick={stopSwarm} className="ml-auto flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[12px] font-medium text-red-300 hover:bg-red-500/25"><Square size={12} /> Stop team</button>}
      </div>

      <div className="border-b border-white/6 p-3">
        <div className="rounded-2xl border border-white/10 bg-[#17191e] focus-within:border-white/20">
          <textarea value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !swarmRunning) { e.preventDefault(); launch(); } }} rows={2} disabled={swarmRunning} placeholder="Tell the team what to build… e.g. 'Add a clock, search bar, and fix the links on the home page.'" className="max-h-32 w-full resize-none bg-transparent px-4 py-3 text-[13px] text-white outline-none placeholder:text-slate-500 disabled:opacity-50" />
          {!swarmRunning && (
            <div className="flex items-center justify-between px-3 pb-3">
              <span className="text-[11px] text-slate-500">Seeker Pro 1.2 plans, the others build at the same time</span>
              <button onClick={launch} disabled={!task.trim()} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[12.5px] font-medium text-black disabled:opacity-30 hover:bg-slate-100"><Sparkles size={14} /> Launch team</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {swarmPlanSummary && (
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">Seeker Pro 1.2 Plan</div>
            <div className="text-[13px] text-white">{swarmPlanSummary}</div>
          </div>
        )}

        {roster.map((a) => {
          const entry = entryBy.get(a.id) ?? { agentId: a.id, status: "idle", note: "", file: "", step: 0, text: "", tools: [] };
          return <AgentCard key={a.id} entry={entry} color={a.color} label={a.label} short={a.short} role={a.role} />;
        })}

        {swarmEntries.map((e) => {
          if (roster.some((a) => a.id === e.agentId)) return null;
          const def = AGENT_BY_ID.get(e.agentId);
          return <AgentCard key={e.agentId} entry={e} color={def?.color ?? "#64748b"} label={def?.label ?? e.agentId} short={def?.short ?? "?"} role="Custom assistant" />;
        })}

        {!swarmRunning && !swarmPlanSummary && <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-slate-500">No active team run. Describe what you want to build above and launch the team.</div>}

        {!!staging.size && <button onClick={() => setPanel("diff")} className="flex w-full items-center gap-2.5 rounded-2xl border border-white bg-white px-4 py-3 text-left hover:bg-slate-100"><Sparkles size={16} className="text-black" /><span className="text-[13px] font-medium text-black">{staging.size} change{staging.size > 1 ? "s" : ""} from the team ready</span><span className="ml-auto text-[12px] font-medium text-black/60">Review →</span></button>}
      </div>
    </div>
  );
}
