/**
 * Autonomous agent loop.
 *
 *   user turn → LLM stream → parse ```tool blocks → execute sequentially →
 *   feed TOOL_RESULTS back → repeat until `finish`, step budget, or abort.
 *
 * Conversation memory is windowed: full fidelity for the last N turns, and
 * older tool output is elided to a one-line receipt. This is what keeps a long
 * agent session from ballooning both the context window and JS heap.
 */
import { streamChat, type ChatMessage } from "./nvidiaClient";
import type { ModelSettings } from "./config";
import { executeTool, parseToolCalls, type ToolCall, type ToolContext, type ToolResult } from "./tools";

export interface AgentCallbacks {
  onReasoning: (delta: string) => void;
  onContent: (delta: string) => void;
  onAssistantDone: (full: { content: string; reasoning: string }) => void;
  onToolStart: (call: ToolCall) => void;
  onToolResult: (result: ToolResult) => void;
  onStep: (n: number) => void;
  onUsage: (u: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void;
  onFinish: (reason: "finish" | "budget" | "aborted" | "no-tools" | "error", detail?: string) => void;
}

const MAX_TOOL_OUTPUT = 24000;

export async function runAgent(opts: {
  settings: ModelSettings;
  system: string;
  history: ChatMessage[];
  ctx: ToolContext;
  callbacks: AgentCallbacks;
  signal: AbortSignal;
}) {
  const { settings, system, ctx, callbacks, signal } = opts;
  const messages: ChatMessage[] = [{ role: "system", content: system }, ...opts.history];

  for (let step = 1; step <= settings.maxAgentSteps; step++) {
    if (signal.aborted) return callbacks.onFinish("aborted");
    callbacks.onStep(step);

    let result;
    try {
      result = await streamChat(
        settings,
        messages,
        {
          onReasoning: callbacks.onReasoning,
          onContent: callbacks.onContent,
          onUsage: callbacks.onUsage,
        },
        signal,
      );
    } catch (e: any) {
      return callbacks.onFinish("error", e?.message ?? String(e));
    }
    if (result.aborted) return callbacks.onFinish("aborted");

    callbacks.onAssistantDone({ content: result.content, reasoning: result.reasoning });
    messages.push({ role: "assistant", content: result.content });

    const { calls } = parseToolCalls(result.content);
    if (!calls.length) return callbacks.onFinish("no-tools");

    const receipts: string[] = [];
    for (const call of calls) {
      if (signal.aborted) return callbacks.onFinish("aborted");
      if (call.tool === "finish") {
        callbacks.onToolStart(call);
        const r: ToolResult = { id: call.id, tool: "finish", ok: true, mutating: false, output: String(call.args.summary ?? "done") };
        callbacks.onToolResult(r);
        return callbacks.onFinish("finish", r.output);
      }
      callbacks.onToolStart(call);
      const r = await executeTool(ctx, call);
      callbacks.onToolResult(r);
      const out = r.output.length > MAX_TOOL_OUTPUT ? r.output.slice(0, MAX_TOOL_OUTPUT) + `\n… [truncated ${r.output.length - MAX_TOOL_OUTPUT} chars]` : r.output;
      receipts.push(`### ${call.tool}(${JSON.stringify(call.args).slice(0, 180)})\n${r.ok ? "" : "FAILED — "}${out}`);
    }

    messages.push({
      role: "user",
      content: `TOOL_RESULTS (step ${step}/${settings.maxAgentSteps}):\n\n${receipts.join("\n\n")}\n\nContinue. If the task is complete, call the finish tool.`,
    });

    // context hygiene: elide stale tool payloads
    if (messages.length > 12) {
      for (let i = 1; i < messages.length - 6; i++) {
        const m = messages[i];
        if (m.role === "user" && m.content.startsWith("TOOL_RESULTS") && m.content.length > 400) {
          messages[i] = { role: "user", content: m.content.slice(0, 300) + "\n… [older tool output elided]" };
        }
      }
    }
  }

  callbacks.onFinish("budget");
}
