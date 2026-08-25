/**
 * Multi-agent orchestrator ("instances").
 *
 * Nemotron (planner) breaks a task into an ordered plan. Each plan step is
 * handed to a coder instance that runs the normal tool loop against the SHARED
 * staging + filesystem context, so every instance sees the others' staged
 * edits (read-your-neighbours-writes). A reviewer instance then critiques the
 * combined diff and can request one fix pass. All instances post to a shared
 * "blackboard" so they stay in sync.
 *
 * Everything funnels through the same Staging object the single-agent path uses,
 * so the diff-review UX is unchanged — you still approve every write.
 */
import { runCompletion, type ChatMessage } from "./nvidiaClient";
import { modelDef, type ModelSettings } from "./config";
import { executeTool, parseToolCalls, unifiedPreview, type ToolCall, type ToolContext, type ToolResult } from "./tools";

export type InstanceRole = "planner" | "coder" | "reviewer";

export interface Instance {
  id: string;
  role: InstanceRole;
  model: string;
  label: string;
  status: "idle" | "thinking" | "acting" | "waiting" | "done" | "error";
  task: string;
  step: number;
  reasoning: string;
  output: string;
  tools: { call: ToolCall; result?: ToolResult }[];
}

export interface PlanStep {
  id: number;
  title: string;
  detail: string;
  status: "pending" | "active" | "done" | "failed";
  assignee?: string;
}

export interface OrchestratorCallbacks {
  onInstance: (inst: Instance) => void; // upsert
  onInstanceDelta: (id: string, patch: Partial<Instance>) => void;
  onReasoning: (id: string, delta: string) => void;
  onContent: (id: string, delta: string) => void;
  onToolStart: (id: string, call: ToolCall) => void;
  onToolResult: (id: string, result: ToolResult) => void;
  onPlan: (steps: PlanStep[]) => void;
  onPlanStep: (id: number, patch: Partial<PlanStep>) => void;
  onBlackboard: (line: string) => void;
  onUsage: (u: { total_tokens?: number }) => void;
  onDone: (summary: string, reason: "finish" | "aborted" | "error") => void;
}

const MAX_TOOL_OUTPUT = 6000;
const CODER_MAX_STEPS = 8;

function rid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Ask the planner to decompose the task into JSON steps. */
async function makePlan(
  settings: ModelSettings,
  system: string,
  task: string,
  cb: OrchestratorCallbacks,
  signal: AbortSignal,
): Promise<PlanStep[]> {
  const planner: Instance = {
    id: "planner",
    role: "planner",
    model: settings.plannerModel,
    label: modelDef(settings.plannerModel).short,
    status: "thinking",
    task: "Plan the work",
    step: 1,
    reasoning: "",
    output: "",
    tools: [],
  };
  cb.onInstance(planner);

  const prompt = `${system}

You are the PLANNER. Break the user's task into a short ordered list of concrete, independent-as-possible steps that coder agents can execute. Prefer 1-5 steps. Each step should touch a small set of files.

Respond with ONLY a JSON array, no prose:
[{"title":"short title","detail":"what to do and which files"}]

User task: ${task}`;

  const r = await runCompletion(
    settings,
    [{ role: "user", content: prompt }],
    {
      onReasoning: (d) => cb.onReasoning("planner", d),
      onContent: (d) => cb.onContent("planner", d),
      onUsage: cb.onUsage,
    },
    signal,
    { model: settings.plannerModel },
  );

  let steps: PlanStep[] = [];
  const jsonMatch = r.content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      steps = arr.slice(0, 6).map((s: any, i: number) => ({
        id: i + 1,
        title: String(s.title ?? s.step ?? `Step ${i + 1}`),
        detail: String(s.detail ?? s.description ?? s.title ?? ""),
        status: "pending" as const,
      }));
    } catch {
      /* fall through */
    }
  }
  if (!steps.length) {
    steps = [{ id: 1, title: "Complete the task", detail: task, status: "pending" }];
  }
  cb.onInstanceDelta("planner", { status: "done", output: `Planned ${steps.length} step(s).` });
  cb.onPlan(steps);
  cb.onBlackboard(`Planner (${planner.label}) created ${steps.length} step(s).`);
  return steps;
}

/** Run one coder instance through the tool loop for a single plan step. */
async function runCoder(
  settings: ModelSettings,
  system: string,
  step: PlanStep,
  blackboard: string[],
  ctx: ToolContext,
  cb: OrchestratorCallbacks,
  signal: AbortSignal,
): Promise<string> {
  const id = `coder-${step.id}`;
  const inst: Instance = {
    id,
    role: "coder",
    model: settings.coderModel,
    label: modelDef(settings.coderModel).short,
    status: "thinking",
    task: step.title,
    step: 0,
    reasoning: "",
    output: "",
    tools: [],
  };
  cb.onInstance(inst);
  cb.onPlanStep(step.id, { status: "active", assignee: inst.label });

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `You are CODER agent #${step.id}. Other agents are working on the same project in parallel; their staged edits are visible when you read files.

Shared notes from the team:
${blackboard.slice(-8).join("\n") || "(none yet)"}

Your assigned step: ${step.title}
Details: ${step.detail}

Use tools to read the relevant files and stage your edits. When your step is complete, call the finish tool with a one-line summary.`,
    },
  ];

  let summary = "";
  for (let s = 1; s <= CODER_MAX_STEPS; s++) {
    if (signal.aborted) return "aborted";
    cb.onInstanceDelta(id, { status: "thinking", step: s });

    const r = await runCompletion(
      settings,
      messages,
      {
        onReasoning: (d) => cb.onReasoning(id, d),
        onContent: (d) => cb.onContent(id, d),
        onUsage: cb.onUsage,
      },
      signal,
      { model: settings.coderModel },
    );
    if (r.aborted) return "aborted";

    messages.push({ role: "assistant", content: r.content });
    const { calls } = parseToolCalls(r.content);
    if (!calls.length) {
      summary = r.content.slice(0, 200);
      break;
    }

    cb.onInstanceDelta(id, { status: "acting" });
    const receipts: string[] = [];
    let finished = false;
    for (const call of calls) {
      if (signal.aborted) return "aborted";
      if (call.tool === "finish") {
        summary = String(call.args.summary ?? "done");
        cb.onToolStart(id, call);
        cb.onToolResult(id, { id: call.id, tool: "finish", ok: true, mutating: false, output: summary });
        finished = true;
        break;
      }
      cb.onToolStart(id, call);
      const res = await executeTool(ctx, call);
      cb.onToolResult(id, res);
      const out = res.output.length > MAX_TOOL_OUTPUT ? res.output.slice(0, MAX_TOOL_OUTPUT) + "\n… [truncated]" : res.output;
      receipts.push(`### ${call.tool}(${JSON.stringify(call.args).slice(0, 160)})\n${res.ok ? "" : "FAILED — "}${out}`);
    }
    if (finished) break;
    messages.push({ role: "user", content: `TOOL_RESULTS:\n\n${receipts.join("\n\n")}\n\nContinue or call finish.` });
  }

  cb.onInstanceDelta(id, { status: "done", output: summary || "Step complete." });
  cb.onPlanStep(step.id, { status: "done" });
  cb.onBlackboard(`Coder #${step.id} (${inst.label}) finished: ${summary || step.title}`);
  return summary;
}

/** Reviewer reads the combined staged diff and returns a verdict + optional fixes. */
async function runReviewer(
  settings: ModelSettings,
  system: string,
  ctx: ToolContext,
  cb: OrchestratorCallbacks,
  signal: AbortSignal,
): Promise<string> {
  const id = "reviewer";
  const inst: Instance = {
    id,
    role: "reviewer",
    model: settings.reviewerModel,
    label: modelDef(settings.reviewerModel).short,
    status: "thinking",
    task: "Review combined changes",
    step: 1,
    reasoning: "",
    output: "",
    tools: [],
  };
  cb.onInstance(inst);

  const diff = unifiedPreview(ctx.staging);
  if (!diff.trim()) {
    cb.onInstanceDelta(id, { status: "done", output: "No staged changes to review." });
    return "No changes were produced.";
  }

  const r = await runCompletion(
    settings,
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `You are the REVIEWER. Here is the combined diff produced by the coder agents. Check for correctness, missed edge cases, and consistency between files. Reply with a short verdict. If something is clearly wrong, say exactly which file and line.

${diff.slice(0, 12000)}`,
      },
    ],
    {
      onReasoning: (d) => cb.onReasoning(id, d),
      onContent: (d) => cb.onContent(id, d),
      onUsage: cb.onUsage,
    },
    signal,
    { model: settings.reviewerModel },
  );

  cb.onInstanceDelta(id, { status: "done", output: r.content.slice(0, 400) });
  cb.onBlackboard(`Reviewer (${inst.label}) verdict recorded.`);
  return r.content;
}

export async function runOrchestrator(opts: {
  settings: ModelSettings;
  system: string;
  task: string;
  ctx: ToolContext;
  callbacks: OrchestratorCallbacks;
  signal: AbortSignal;
}) {
  const { settings, system, task, ctx, callbacks, signal } = opts;
  const blackboard: string[] = [];
  const post = (line: string) => {
    blackboard.push(line);
    callbacks.onBlackboard(line);
  };
  void rid;

  try {
    const steps = await makePlan(settings, system, task, callbacks, signal);
    if (signal.aborted) return callbacks.onDone("Stopped.", "aborted");

    for (const step of steps) {
      if (signal.aborted) return callbacks.onDone("Stopped.", "aborted");
      const summary = await runCoder(settings, system, step, blackboard, ctx, callbacks, signal);
      if (summary === "aborted") return callbacks.onDone("Stopped.", "aborted");
      post(`Step ${step.id} done: ${summary || step.title}`);
    }

    if (signal.aborted) return callbacks.onDone("Stopped.", "aborted");
    const verdict = await runReviewer(settings, system, ctx, callbacks, signal);

    const changed = ctx.staging.size;
    callbacks.onDone(
      `${steps.length} agent step(s) complete. ${changed} file(s) staged for review.\n\nReviewer: ${verdict.slice(0, 400)}`,
      "finish",
    );
  } catch (e: any) {
    if (e?.name === "AbortError") return callbacks.onDone("Stopped.", "aborted");
    callbacks.onDone(e?.message ?? String(e), "error");
  }
}
