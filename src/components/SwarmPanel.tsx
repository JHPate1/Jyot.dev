import { useEffect, useRef, useState } from "react";
import { ChevronDown, Hammer, Sparkles, Square, Users } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";
import { Markdown } from "./Markdown";
import { AGENTS } from "@/lib/ai/models";
import type { SwarmEntry } from "@/lib/ai/swarm";

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  idle: { label: "Ready", cls: "text-slate-400", dot: "bg-slate-500" },
  planning: { label: "Planning", cls: "text-indigo-300", dot: "bg-indigo-400 animate-pulse" },
  working: { label: "Working", cls: "text-emerald-300", dot: "bg-emerald-400 animate-pulse" },
  done: { label: "Done", cls: "text-white", dot: "bg-white" },
  error: { label: "Stopped", cls: "text-amber-300", dot: "bg-amber-400" },
};

function AgentCard({
  entry,
  color,
  label,
  role,
  short,
}: {
  entry: SwarmEntry;
  color: string;
  label: string;
  role: string;
  short: string;
}) {
  const [open, setOpen] = useState(true);
  const status = STATUS[entry.status] ?? STATUS.idle;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entry.text, open]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0d0e12]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white" style={{ background: color }}>
          {short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-white">{label}</span>
            <span className={cn("flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-[10.5px]", status.cls)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <div className="truncate text-[12px] text-slate-400">{role}</div>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-white/6 px-4 py-3">
          {entry.file && <div className="mb-2 font-mono text-[11.5px] text-slate-300">Editing {entry.file}</div>}
          {entry.note && entry.status !== "idle" && <div className="mb-2 text-[12.5px] text-slate-300">{entry.note}</div>}
          {!!entry.tools.length && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {entry.tools.slice(-6).map((t, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                  <Hammer size={11} />
                  {t.call.tool}
                </span>
              ))}
            </div>
          )}
          {!!entry.text && (
            <div ref={ref} className="max-h-40 overflow-y-auto rounded-xl bg-[#121418] px-3 py-2.5">
              <Markdown src={entry.text.slice(-2500)} />
            </div>
          )}
          {entry.status === "idle" && !entry.text && (
            <div className="text-[12.5px] text-slate-500">Waiting for a goal below. Then Seeker Pro 1.2 will assign work here.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SwarmPanel() {
  const { swarmRunning, swarmPlanSummary, swarmEntries, agents, startSwarm, stopSwarm, staging, setPanel, stagingVersion } =
    useIde();
  const [task, setTask] = useState("");
  void stagingVersion;

  // Always show the full built-in team — never an empty table
  const source = agents.length ? agents : AGENTS;
  const roster = source.filter((a) => a.enabled || a.isArchitect);
  const entryBy = new Map(swarmEntries.map((e) => [e.agentId, e]));
  const visible = swarmEntries.length
    ? swarmEntries.map((e) => ({ entry: e, profile: roster.find((a) => a.id === e.agentId.split("#")[0]) ?? roster[0] }))
    : roster.map((a) => ({
        profile: a,
        entry: entryBy.get(a.id) ?? ({ agentId: a.id, status: "idle", note: "", file: "", step: 0, text: "", tools: [] } satisfies SwarmEntry),
      }));

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
        <div>
          <div className="text-[13.5px] font-semibold text-white">Seeker Team</div>
          <div className="text-[11.5px] text-slate-400">3 agent types · up to 20 instances each · Nemotron-backed</div>
        </div>
        {swarmRunning && (
          <button
            onClick={stopSwarm}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[12px] font-medium text-red-300 hover:bg-red-500/25"
          >
            <Square size={12} /> Stop
          </button>
        )}
      </div>

      {/* Always-visible launch box first so empty state isn't confusing */}
      <div className="border-b border-white/6 p-3">
        <div className="rounded-2xl border border-white/10 bg-[#0d0e12] focus-within:border-white/25">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !swarmRunning) {
                e.preventDefault();
                launch();
              }
            }}
            rows={3}
            disabled={swarmRunning}
            placeholder={'Type a goal, then press Launch. Example: "Add a search bar and fix the home page links."'}
            className="max-h-36 w-full resize-none bg-transparent px-4 py-3 text-[13.5px] text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <span className="text-[11.5px] text-slate-500">
              {swarmRunning ? "Team is working…" : "Pro plans · Perplex builds · Flash cleans up"}
            </span>
            {!swarmRunning ? (
              <button
                onClick={launch}
                disabled={!task.trim()}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-30 hover:bg-slate-100"
              >
                <Sparkles size={14} /> Launch team
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {swarmPlanSummary && (
          <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">Plan from Seeker Pro 1.2</div>
            <div className="text-[13.5px] text-white">{swarmPlanSummary}</div>
          </div>
        )}

        {!roster.length && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
            Team list didn’t load. Refresh the page.
          </div>
        )}

        {visible.map(({ entry, profile }) => (
          <AgentCard
            key={entry.agentId}
            entry={entry}
            color={profile.color}
            label={entry.agentId.includes("#") ? `${profile.label} ${entry.agentId.split("#")[1]}` : profile.label}
            short={entry.agentId.includes("#") ? `${profile.short}${entry.agentId.split("#")[1]}` : profile.short}
            role={profile.role}
          />
        ))}

        {!!staging.size && (
          <button
            onClick={() => setPanel("diff")}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-white px-4 py-3.5 text-left hover:bg-slate-100"
          >
            <Sparkles size={16} className="text-black" />
            <span className="text-[13.5px] font-semibold text-black">
              {staging.size} change{staging.size > 1 ? "s" : ""} ready to review
            </span>
            <span className="ml-auto text-[12.5px] font-medium text-black/60">Open Review →</span>
          </button>
        )}
      </div>
    </div>
  );
}
