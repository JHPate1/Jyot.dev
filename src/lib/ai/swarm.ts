/**
 * Multi-agent swarm.
 *
 * The Nemotron **architect** reads the task + repo map and decomposes it into
 * 2-4 parallel subtasks, assigning each to a specialist and to a disjoint set
 * of files. The specialists then run bounded tool loops **concurrently** on the
 * SAME VFS, staging map and index. Because they all live in one runtime, a
 * shared mutable "team board" is genuinely synchronous: before every model call
 * a worker re-reads the board, so it sees what its teammates just did and can
 * adapt (skip a file someone already fixed, build on their change, etc.).
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
  callbacks: SwarmCallbacks;
  signal: AbortSignal;
}

const MAX_TOOL_OUTPUT = 24000;

function repoMap(index: WorkspaceIndex): string {
  return index.ready ? index.repoMap(2600) : "(index still building — use list_dir)";
}

/** Extract the first balanced {...} JSON object from free text. */
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

const PLAN_SYSTEM = `You are the ARCHITECT of a small autonomous coding team working in the user's project.
You do not edit files yourself. You decompose the user's task into 2-4 subtasks that can run IN PARALLEL.
Rules:
- Assign each subtask to one specialist (by id) whose role fits.
- Assign each subtask a set of files it OWNS. Different subtasks must own DIFFERENT files to avoid write conflicts.
- Objectives must be concrete and self-contained (include context they need).
- If the task really needs only one agent, return a single subtask.
Respond with ONLY this JSON, no prose, no code fences:
{"summary": "<one line plan>", "subtasks": [{"agent":"<id>","objective":"<what to do>","files":["<path>",...]}]}`;

function rosterLines(roster: AgentProfile[]): string {
  return roster.map((a) => `- ${a.id}: ${a.label} — ${a.role}`).join("\n");
}

function workerSystem(a: AgentProfile, sub: Subtask, ctx: Ctx): string {
  return `You are ${a.label} (${a.short}), a coding agent on a team.
Your specialty: ${a.role}
You are working on the subtask: ${sub.objective}
Files you own: ${sub.files.length ? sub.files.join(", ") : "(you may create new files as needed)"}

WORKING AGREEMENT:
- Other agents are editing the same project at the same time.
- Before acting you are given a live TEAM STATUS. If a teammate already handled one of your files, adapt — do not duplicate or clobber their work.
- Only read/edit files relevant to your subtask.
- Stage changes with tools; never claim a file is saved.
- When your subtask is complete, call the finish tool with a 1-2 line summary.

Repo map:
\`\`\`
${repoMap(ctx.index)}
\`\`\`
${TOOL_SPEC}`;
}

function boardTextOf(entries: SwarmEntry[], roster: AgentProfile[]): string {
  return entries
    .filter((e) => e.status !== "idle")
    .map((e) => {
      const a = roster.find((x) => x.id === e.agentId);
      return `- ${a?.short ?? e.agentId} [${e.status}] ${e.file ? `editing ${e.file} · ` : ""}${e.note}`;
    })
    .join("\n") || "(no teammates active yet)";
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

  // ---- 1. Architect plans -------------------------------------------------
  setBoard(architect.id, { status: "planning", note: "Reading project & planning…" });
  let plan: { summary: string; subtasks: Subtask[] };
  try {
    const raw = await completeProfile(
      toProfile(architect),
      [
        { role: "system", content: PLAN_SYSTEM },
        {
          role: "user",
          content: `TASK:\n${task}\n\nTEAM ROSTER:\n${rosterLines(roster)}\n\nREPO MAP:\n${repoMap(ctx.index)}\n\nReturn only the JSON plan.`,
        },
      ],
      signal,
    );
    const obj = firstObject(raw);
    if (!obj) throw new Error("Architect returned no plan.");
    const parsed = JSON.parse(obj);
    const validIds = new Set(roster.map((r) => r.id));
    let subtasks: Subtask[] = (Array.isArray(parsed.subtasks) ? parsed.subtasks : [])
      .map((s: any) => ({
        agent: typeof s.agent === "string" && validIds.has(s.agent) ? s.agent : "deepseek",
        objective: String(s.objective ?? s.description ?? "Complete the task."),
        files: Array.isArray(s.files) ? s.files.map(String) : [],
      }))
      .slice(0, 4);
    if (!subtasks.length) subtasks = [{ agent: "deepseek", objective: task, files: [] }];
    plan = { summary: String(parsed.summary ?? "Decomposed task into parallel subtasks."), subtasks };
  } catch (e: any) {
    if (signal.aborted) return callbacks.onFinish("aborted");
    setBoard(architect.id, { status: "error", note: e.message ?? "Planning failed" });
    return callbacks.onFinish("error", e.message);
  }

  callbacks.onPlan(plan.summary, plan.subtasks);
  setBoard(architect.id, { status: "done", note: plan.summary });

  // ---- 2. Run workers in parallel ----------------------------------------
  const assigned = new Map<string, Subtask[]>();
  plan.subtasks.forEach((s) => assigned.set(s.agent, [...(assigned.get(s.agent) ?? []), s]));

  const busText = () => boardTextOf(entries, roster);

  const workers = [...assigned.entries()].map(([agentId, subs], idx) => {
    const agent = roster.find((a) => a.id === agentId) ?? architect;
    // stagger starts so agents sharing an API key don't collide on rate limits
    return sleep(idx * 500).then(() => runWorkers(agent, subs, ctx, entries, setBoard, busText));
  });

  const results = await Promise.allSettled(workers);

  const failed = results.filter((r) => r.status === "rejected");

  // ---- 3. Architect review over the combined staged diff ------------------
  const staged = ctx.staging.list;
  if (staged.length && !signal.aborted) {
    setBoard(architect.id, { status: "working", note: "Reviewing combined changes…" });
    const diffPreview = staged
      .map((c) => `── ${c.path} (${c.kind})\n${c.after.slice(0, 1500)}`)
      .join("\n\n")
      .slice(0, 12000);
    try {
      const review = await streamProfile(
        toProfile(architect),
        [
          { role: "system", content: "You are the team architect. Review the combined staged changes and give a short, confident verdict on correctness and next steps. Max 6 lines." },
          { role: "user", content: `TASK was: ${task}\n\nSTAGED CHANGES:\n${diffPreview}` },
        ],
        { onContent: (d) => callbacks.onMessage(architect.id, d) },
        signal,
      );
      entry(architect.id).text += (entry(architect.id).text ? "\n\n" : "") + review.content;
      setBoard(architect.id, { status: "done", note: review.content ? "Review complete." : "Review done." });
    } catch {
      setBoard(architect.id, { status: "done", note: "Planning & review complete." });
    }
  }

  callbacks.onFinish(
    signal.aborted ? "aborted" : failed.length === results.length ? "error" : "done",
    `${staged.length} file(s) staged · ${plan.subtasks.length} subtask(s)`,
  );
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
    {
      role: "user",
      content: `Begin your subtask now.\nObjective: ${sub.objective}\nFiles you own: ${owned.length ? owned.join(", ") : "(create new files as needed)"}\nUse tools to read the relevant files, then stage your edits.`,
    },
  ];

  for (let step = 1; step <= agent.maxSteps; step++) {
    if (signal.aborted) return setBoard(agent.id, { status: "error", note: "Stopped" });

    if (step > 1) {
      messages.push({ role: "user", content: `LIVE TEAM STATUS:\n${busText()}\nContinue your work, or call finish if done.` });
    }

    let result: StreamResult;
    try {
      result = await streamProfile(
        toProfile(agent),
        messages,
        {
          onContent: (d) => callbacks.onMessage(agent.id, d),
          onUsage: (u) => callbacks.onUsage(u),
        },
        signal,
      );
    } catch (e: any) {
      return setBoard(agent.id, { status: "error", note: e.message ?? "Error" });
    }
    if (signal.aborted) return setBoard(agent.id, { status: "error", note: "Stopped" });

    entry.text += (entry.text ? "" : ""); // streamed via onMessage
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
      setBoard(agent.id, {
        status: "working",
        step,
        file: r.path ?? "",
        note: r.ok ? `${call.tool} ✓` : `${call.tool} ✕ ${r.output.slice(0, 50)}`,
      });
    }

    const receipts = calls
      .map((c) => {
        const last = entry.tools.filter((t) => t.call.id === c.id).pop();
        const out = last?.result?.output ?? "";
        const clipped = out.length > MAX_TOOL_OUTPUT ? out.slice(0, MAX_TOOL_OUTPUT) + `\n… [truncated]` : out;
        return `### ${c.tool}(${JSON.stringify(c.args).slice(0, 160)})\n${last?.result?.ok ? "" : "FAILED — "}${clipped}`;
      })
      .join("\n\n");
    messages.push({ role: "user", content: `TOOL_RESULTS:\n\n${receipts}\n\nContinue, or call finish when your subtask is complete.` });
  }

  setBoard(agent.id, { status: "done", note: "Step limit reached." });
}

// swarm workers share the same ToolContext (fs/index/staging)
function ctxTool(ctx: Ctx): Parameters<typeof executeTool>[0] {
  return { fs: ctx.fs, index: ctx.index, staging: ctx.staging, onLog: () => {} };
}
