/**
 * Seeker Code — Team Swarm
 * Seeker Pro 1.2 is the architect, Seeker Perplex and Seeker Code Flash are workers.
 * They share one workspace and a live board so they stay in sync.
 */
import type { VFS } from "../fs/types";
import type { WorkspaceIndex } from "../index/workspaceIndex";
import { executeTool, parseToolCalls, type Staging, type ToolCall, type ToolResult } from "./tools";
import { completeProfile, streamProfile, type ChatMessage, type StreamResult } from "./nvidiaClient";
import { toProfile, type AgentProfile } from "./models";
import { TOOL_SPEC } from "./prompt";

export type AgentStatus = "idle" | "planning" | "working" | "done" | "error";

export interface SwarmEntry {
  agentId: string;
  status: AgentStatus;
  note: string;
  file: string;
  step: number;
  text: string;
  tools: { call: ToolCall; result?: ToolResult }[];
}

export interface Subtask {
  agent: string;
  objective: string;
  files: string[];
}

export interface SwarmCallbacks {
  onPlan: (summary: string, subtasks: Subtask[]) => void;
  onBoard: (entries: SwarmEntry[]) => void;
  onMessage: (agentId: string, delta: string) => void;
  onTool: (agentId: string, call: ToolCall, result?: ToolResult) => void;
  onUsage: (u: { total_tokens?: number }) => void;
  onFinish: (reason: "done" | "error" | "aborted", summary?: string) => void;
}

interface Ctx {
  fs: VFS;
  index: WorkspaceIndex;
  staging: Staging;
  roster: AgentProfile[];
  task: string;
  apiKey: string;
  callbacks: SwarmCallbacks;
  signal: AbortSignal;
}

const MAX_TOOL_OUTPUT = 24000;

function repoMap(index: WorkspaceIndex): string {
  return index.ready ? index.repoMap(2600) : "(project search still indexing — use list_dir to explore)";
}

function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const PLAN_SYSTEM = `
You are Seeker Pro 1.2, the lead architect of the Seeker Code team.

You do NOT edit files yourself. You break the user's goal into 2-4 parallel subtasks that can run at the same time.

Rules:
- Each subtask goes to one teammate (by id) whose skills fit.
- Give each subtask different files to avoid conflicts.
- Objectives must be clear and self-contained.
- If the goal needs only one teammate, return one subtask.
- Respond with ONLY JSON, no prose, no fences:
{"summary": "<one line plan>", "subtasks": [{"agent":"<id>","objective":"<what to do>","files":["<path>",...]}]}
`.trim();

function rosterLines(roster: AgentProfile[]): string {
  return roster.map((a) => `- ${a.id}: ${a.label} — ${a.role}`).join("\n");
}

function workerSystem(a: AgentProfile, sub: Subtask, ctx: Ctx): string {
  return `${a.systemPrompt}

You are working on this team task: ${sub.objective}
Files you own: ${sub.files.length ? sub.files.join(", ") : "(create new files as needed)"}

Team agreement:
- Other Seeker assistants are editing the same project at the same time.
- Before each step you get LIVE TEAM STATUS. If a teammate already handled one of your files, adapt.
- Only touch files relevant to your subtask.
- Stage changes with tools; do not claim files are saved.
- When done, call finish with a short summary.

Project map:
\`\`\`
${repoMap(ctx.index)}
\`\`\`
${TOOL_SPEC}`;
}

function boardTextOf(entries: SwarmEntry[], roster: AgentProfile[]): string {
  return entries.filter((e) => e.status !== "idle").map((e) => {
    const a = roster.find((x) => x.id === e.agentId);
    return `- ${a?.short ?? e.agentId} [${e.status}] ${e.file ? `editing ${e.file} · ` : ""}${e.note}`;
  }).join("\n") || "(no teammates active yet)";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSwarm(ctx: Ctx): Promise<void> {
  const { roster, task, callbacks, signal } = ctx;
  const architect = roster.find((a) => a.isArchitect) ?? roster[0];

  const entries: SwarmEntry[] = roster.map((a) => ({
    agentId: a.id,
    status: "idle" as AgentStatus,
    note: "",
    file: "",
    step: 0,
    text: "",
    tools: [],
  }));
  const entry = (id: string) => entries.find((e) => e.agentId === id)!;
  const setBoard = (id: string, patch: Partial<SwarmEntry>) => {
    Object.assign(entry(id), patch);
    callbacks.onBoard(entries.map((e) => ({ ...e })));
  };

  setBoard(architect.id, { status: "planning", note: "Seeker Pro 1.2 is reading your project and planning…" });
  let plan: { summary: string; subtasks: Subtask[] };
  try {
    const raw = await completeProfile(
      toProfile(architect, ctx.apiKey),
      [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: `GOAL:\n${task}\n\nTEAM:\n${rosterLines(roster)}\n\nPROJECT MAP:\n${repoMap(ctx.index)}\n\nReturn only the JSON plan.` },
      ],
      signal,
    );
    const obj = firstObject(raw);
    if (!obj) throw new Error("No plan returned.");
    const parsed = JSON.parse(obj);
    const validIds = new Set(roster.map((r) => r.id));
    let subtasks: Subtask[] = (Array.isArray(parsed.subtasks) ? parsed.subtasks : []).map((s: any) => ({
      agent: typeof s.agent === "string" && validIds.has(s.agent) ? s.agent : roster.find(r => !r.isArchitect)?.id ?? "seeker-perplex",
      objective: String(s.objective ?? s.description ?? "Complete the task."),
      files: Array.isArray(s.files) ? s.files.map(String) : [],
    })).slice(0, 4);
    if (!subtasks.length) subtasks = [{ agent: roster.find(r => !r.isArchitect)?.id ?? "seeker-perplex", objective: task, files: [] }];
    plan = { summary: String(parsed.summary ?? "Split into parallel tasks."), subtasks };
  } catch (e: any) {
    if (signal.aborted) return callbacks.onFinish("aborted");
    setBoard(architect.id, { status: "error", note: e.message ?? "Planning failed" });
    return callbacks.onFinish("error", e.message);
  }

  callbacks.onPlan(plan.summary, plan.subtasks);
  setBoard(architect.id, { status: "done", note: plan.summary });

  const assigned = new Map<string, Subtask[]>();
  plan.subtasks.forEach((s) => assigned.set(s.agent, [...(assigned.get(s.agent) ?? []), s]));
  const busText = () => boardTextOf(entries, roster);

  const workers = [...assigned.entries()].map(([agentId, subs], idx) => {
    const agent = roster.find((a) => a.id === agentId) ?? architect;
    return sleep(idx * 450).then(() => runWorkers(agent, subs, ctx, entries, setBoard, busText));
  });

  const results = await Promise.allSettled(workers);
  const failed = results.filter((r) => r.status === "rejected");
  const staged = ctx.staging.list;

  if (staged.length && !signal.aborted) {
    setBoard(architect.id, { status: "working", note: "Seeker Pro 1.2 is reviewing all changes…" });
    const diffPreview = staged.map((c) => `── ${c.path} (${c.kind})\n${c.after.slice(0, 1500)}`).join("\n\n").slice(0, 12000);
    try {
      const review = await streamProfile(
        toProfile(architect, ctx.apiKey),
        [
          { role: "system", content: "You are Seeker Pro 1.2, lead architect. Review the combined staged changes and give a short verdict. Max 6 lines, plain English." },
          { role: "user", content: `GOAL was: ${task}\n\nSTAGED CHANGES:\n${diffPreview}` },
        ],
        { onContent: (d) => callbacks.onMessage(architect.id, d) },
        signal,
      );
      entry(architect.id).text += (entry(architect.id).text ? "\n\n" : "") + review.content;
      setBoard(architect.id, { status: "done", note: "Review complete." });
    } catch {
      setBoard(architect.id, { status: "done", note: "Plan and review complete." });
    }
  }

  callbacks.onFinish(signal.aborted ? "aborted" : failed.length === results.length ? "error" : "done", `${staged.length} change(s) ready · ${plan.subtasks.length} task(s)`);
}

async function runWorkers(
  agent: AgentProfile,
  subs: Subtask[],
  ctx: Ctx,
  entries: SwarmEntry[],
  setBoard: (id: string, patch: Partial<SwarmEntry>) => void,
  busText: () => string,
): Promise<void> {
  const { callbacks, signal } = ctx;
  const entry = entries.find((e) => e.agentId === agent.id)!;
  const sub = subs[0];
  const owned = subs.flatMap((s) => s.files);

  setBoard(agent.id, { status: "working", step: 0, note: "Starting…", file: sub.files[0] ?? "" });

  const messages: ChatMessage[] = [
    { role: "system", content: workerSystem(agent, sub, ctx) },
    { role: "user", content: `Begin now.\nGoal: ${sub.objective}\nFiles you own: ${owned.length ? owned.join(", ") : "(create new files if needed)"}\nRead relevant files, then stage your edits.` },
  ];

  for (let step = 1; step <= agent.maxSteps; step++) {
    if (signal.aborted) return setBoard(agent.id, { status: "error", note: "Stopped" });
    if (step > 1) messages.push({ role: "user", content: `LIVE TEAM STATUS:\n${busText()}\nContinue, or call finish if done.` });

    let result: StreamResult;
    try {
      result = await streamProfile(toProfile(agent, ctx.apiKey), messages, { onContent: (d) => callbacks.onMessage(agent.id, d), onUsage: (u) => callbacks.onUsage(u) }, signal);
    } catch (e: any) {
      return setBoard(agent.id, { status: "error", note: e.message ?? "Error" });
    }
    if (signal.aborted) return setBoard(agent.id, { status: "error", note: "Stopped" });

    messages.push({ role: "assistant", content: result.content });
    const { calls } = parseToolCalls(result.content);
    if (!calls.length) {
      const prose = result.content.trim();
      return setBoard(agent.id, { status: "done", note: prose ? prose.split("\n").pop()!.slice(0, 80) : "Done" });
    }

    for (const call of calls) {
      if (signal.aborted) return setBoard(agent.id, { status: "error", note: "Stopped" });
      if (call.tool === "finish") {
        callbacks.onTool(agent.id, call);
        const r: ToolResult = { id: call.id, tool: "finish", ok: true, mutating: false, output: String(call.args.summary ?? "done") };
        callbacks.onTool(agent.id, call, r);
        entry.tools.push({ call, result: r });
        return setBoard(agent.id, { status: "done", note: String(call.args.summary ?? "Done") });
      }
      callbacks.onTool(agent.id, call);
      const r = await executeTool(ctxTool(ctx), call);
      callbacks.onTool(agent.id, call, r);
      entry.tools.push({ call, result: r });
      setBoard(agent.id, { status: "working", step, file: r.path ?? "", note: r.ok ? `${call.tool} ✓` : `${call.tool} ✕` });
    }

    const receipts = calls.map((c) => {
      const last = entry.tools.filter((t) => t.call.id === c.id).pop();
      const out = last?.result?.output ?? "";
      const clipped = out.length > MAX_TOOL_OUTPUT ? out.slice(0, MAX_TOOL_OUTPUT) + `\n… [truncated]` : out;
      return `### ${c.tool}(${JSON.stringify(c.args).slice(0, 160)})\n${last?.result?.ok ? "" : "FAILED — "}${clipped}`;
    }).join("\n\n");
    messages.push({ role: "user", content: `TOOL_RESULTS:\n\n${receipts}\n\nContinue, or call finish when done.` });
  }
  setBoard(agent.id, { status: "done", note: "Step limit reached." });
}

function ctxTool(ctx: Ctx): Parameters<typeof executeTool>[0] {
  return { fs: ctx.fs, index: ctx.index, staging: ctx.staging, onLog: () => {} };
}
