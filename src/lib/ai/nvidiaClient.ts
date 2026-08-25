/**
 * NVIDIA NIM (OpenAI-compatible) streaming client — fetch + ReadableStream SSE.
 *
 * Mirrors the Python snippet:
 *   client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=...)
 *   client.chat.completions.create(model="nvidia/nemotron-3-super-120b-a12b",
 *       temperature=1, top_p=0.95, max_tokens=16384,
 *       extra_body={"chat_template_kwargs": {"enable_thinking": True}}, stream=True)
 *
 * `extra_body` becomes top-level JSON keys over the wire, so we inline
 * chat_template_kwargs directly. Reasoning arrives on
 * `choices[0].delta.reasoning_content`.
 *
 * No SDK: the openai npm package pulls ~1 MB and a Node shim we don't need.
 */
import type { ModelSettings } from "./config";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface StreamHandlers {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  aborted: boolean;
}

export class NvidiaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "NvidiaError";
  }
}

export async function streamChat(
  settings: ModelSettings,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  overrides?: Partial<Pick<ModelSettings, "temperature" | "maxTokens" | "thinking" | "model" | "topP">>,
): Promise<StreamResult> {
  const cfg = { ...settings, ...overrides };
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    max_tokens: cfg.maxTokens,
    stream: true,
    chat_template_kwargs: { enable_thinking: cfg.thinking },
  };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return { content: "", reasoning: "", aborted: true };
    throw new NvidiaError(
      0,
      `Network/CORS failure reaching ${cfg.baseUrl}. If you are on a locked-down network, route through the Amplify/Lambda proxy (see deploy/README.md).`,
    );
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.error?.message || j.message || detail;
    } catch {
      /* raw */
    }
    throw new NvidiaError(res.status, `NIM ${res.status}: ${detail || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";
  let usage: StreamResult["usage"];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const raw of parts) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: any;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.usage) {
          usage = json.usage;
          handlers.onUsage?.(json.usage);
        }
        const choice = json.choices?.[0];
        if (!choice) continue;
        const d = choice.delta ?? {};
        const r = d.reasoning_content ?? d.reasoning;
        if (r) {
          reasoning += r;
          handlers.onReasoning?.(r);
        }
        if (typeof d.content === "string" && d.content.length) {
          content += d.content;
          handlers.onContent?.(d.content);
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return { content, reasoning, usage, aborted: true };
    throw e;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  return { content, reasoning, usage, aborted: false };
}

/** Non-streaming convenience call (used by inline completion + commit messages). */
export async function completeOnce(
  settings: ModelSettings,
  messages: ChatMessage[],
  overrides?: Partial<ModelSettings>,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = { ...settings, ...overrides };
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      top_p: cfg.topP,
      max_tokens: cfg.maxTokens,
      stream: false,
      chat_template_kwargs: { enable_thinking: cfg.thinking },
    }),
    signal,
  });
  if (!res.ok) throw new NvidiaError(res.status, `NIM ${res.status}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

/** Rough token estimate (chars/3.6) — avoids shipping a 2 MB tokenizer. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 3.6);
}
