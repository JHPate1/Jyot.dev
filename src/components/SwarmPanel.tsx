import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Circle, Hammer, Sparkles, Square, Users } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";
import { Markdown } from "./Markdown";
import { AGENT_BY_ID } from "@/lib/ai/models";
import type { SwarmEntry } from "@/lib/ai/swarm";

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  idle: { label: "Idle", cls: "text-slate-500", dot: "bg-slate-600" },
  planning: { label: "Planning", cls: "text-sky-300", dot: "bg-sky-400 animate-pulse" },
  working: { label: "Working", cls: "text-emerald-300", dot: "bg-emerald-400 animate-pulse" },
  done: { label: "Done", cls: "text-slate-300", dot: "bg-slate-400" },
  error: { label: "Stopped", cls: "text-amber-300", dot: "bg-amber-400" },
};

function AgentCard({ entry, color, label, role, short }: { entry: SwarmEntry; color: string; label: string; role: string; short: string }) {
  const [open, setOpen] = useState(true);
  const status = STATUS[entry.status] ?? STATUS.idle;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entry.text, open]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-ink-900/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ background: color }}>
          {short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12.5px] font-medium text-slate-100">{label}</span>
            <span className={cn("flex items-center gap-1 text-[10.5px]", status.cls)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <div className="truncate text-[11px] text-slate-500">{role}</div>
        </div>
        {entry.status === "working" && <span className="shrink-0 font-mono text-[10px] text-slate-500">step {entry.step}</span>}
        <ChevronDown size={14} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-white/6 px-3 py-2.5">
          {entry.file && (
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Circle size={8} className="fill-nv-400 text-nv-400" />
              <span className="font-mono">{entry.file}</span>
            </div>
          )}
          {entry.note && entry.status !== "working" && (
            <div className="mb-2 text-[11.5px] text-slate-400">{entry.note}</div>
          )}

          {!!entry.tools.length && (
            <div className="mb-2 space-y-0.5">
              {entry.tools.slice(-4).map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10.5px]">
                  <Hammer size={10} className={cn(t.result ? (t.result.ok ? "text-emerald-400" : "text-red-400") : "text-slate-500 animate-pulse")} />
                  <span className="font-mono text-slate-400">{t.call.tool}</span>
                  {t.call.args?.path && <span className="truncate font-mono text-slate-600">{t.call.args.path}</span>}
                </div>
              ))}
            </div>
          )}

          {!!entry.text && (
            <div ref={ref} className="max-h-32 overflow-y-auto rounded-lg bg-ink-950/60 px-2.5 py-2">
              <Markdown src={entry.text.slice(-2000)} />
            </div>
          )}

          {!entry.text && !entry.file && entry.status === "idle" && (
            <div className="text-[11px] text-slate-600">Waiting for the architect to assign work…</div>
          )}
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

  const launch = () => {
    const t = task.trim();
    if (!t || swarmRunning) return;
    setTask("");
    startSwarm(t);
  };

  const entryBy = new Map(swarmEntries.map((e) => [e.agentId, e]));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
        <Users size={14} className="text-nv-400" />
        <span className="text-[12.5px] font-medium text-slate-200">Team Swarm</span>
        <span className="text-[11px] text-slate-500">· {roster.length} specialists</span>
        {swarmRunning && (
          <button onClick={stopSwarm} className="ml-auto flex items-center gap-1 rounded bg-red-500/15 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/25">
            <Square size={11} /> Stop
          </button>
        )}
      </div>

      {/* launch */}
      <div className="border-b border-white/6 p-2.5">
        <div className="rounded-lg border border-white/10 bg-ink-850 focus-within:border-white/25">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !swarmRunning) {
                e.preventDefault();
                launch();
              }
            }}
            rows={2}
            disabled={swarmRunning}
            placeholder="Give the team a goal… e.g. 'Add a clock and search bar to the home page, and fix the links.' The architect splits it across your specialists."
            className="max-h-32 w-full resize-none bg-transparent px-3 py-2 text-[12.5px] text-slate-100 outline-none placeholder:text-slate-500 disabled:opacity-50"
          />
          {!swarmRunning && (
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-[10.5px] text-slate-500">Architect plans, specialists build in parallel</span>
              <button
                onClick={launch}
                disabled={!task.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-nv-500 px-3 py-1 text-[12px] font-medium text-white transition disabled:opacity-30 enabled:hover:bg-nv-400"
              >
                <Sparkles size={13} /> Launch team
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {swarmPlanSummary && (
          <div className="rounded-lg border border-white/8 bg-ink-900/60 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              <Bot size={11} /> Plan
            </div>
            <div className="text-[12px] text-slate-300">{swarmPlanSummary}</div>
          </div>
        )}

        {roster.map((a) => {
          const entry = entryBy.get(a.id) ?? { agentId: a.id, status: "idle", note: "", file: "", step: 0, text: "", tools: [] };
          return (
            <AgentCard
              key={a.id}
              entry={entry}
              color={a.color}
              label={a.label}
              short={a.short}
              role={a.role}
            />
          );
        })}

        {/* fallback for agents added by user that aren't in the default map */}
        {swarmEntries.map((e) => {
          if (roster.some((a) => a.id === e.agentId)) return null;
          const def = AGENT_BY_ID.get(e.agentId);
          return <AgentCard key={e.agentId} entry={e} color={def?.color ?? "#64748b"} label={def?.label ?? e.agentId} short={def?.short ?? "?"} role="Custom agent" />;
        })}

        {!swarmRunning && !swarmPlanSummary && (
          <div className="rounded-lg border border-dashed border-white/8 px-3 py-6 text-center text-[11.5px] text-slate-500">
            No active run. Describe a goal above and launch the team. Each specialist works on its own files at the same time, and they share a live board so they stay in sync.
          </div>
        )}

        {!!staging.size && (
          <button
            onClick={() => setPanel("diff")}
            className="flex w-full items-center gap-2 rounded-lg border border-nv-500/40 bg-nv-500/15 px-3 py-2.5 text-left transition hover:bg-nv-500/20"
          >
            <Sparkles size={14} className="text-nv-400" />
            <span className="text-[12.5px] font-medium text-slate-100">{staging.size} file change{staging.size > 1 ? "s" : ""} from the team</span>
            <span className="ml-auto text-[11.5px] font-medium text-nv-300">Review Changes →</span>
          </button>
        )}
      </div>
    </div>
  );
}
