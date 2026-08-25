/**
 * NVIDIA NIM (OpenAI-compatible) client — fetch based, no SDK.
 *
 * Handles:
 *  - per-model API key + thinking-kwarg flavour (see config.modelDef)
 *  - streaming SSE *and* non-streaming JSON (some models are flaky in stream mode)
 *  - automatic retry with exponential backoff on 429 / 5xx / transient network
 *    errors, which is what was causing the random "network error" failures.
 */
import { keyFor, modelDef, type ModelSettings } from "./config";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface StreamHandlers {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onUsage?: (usage: Usage) => void;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface StreamResult {
  content: string;
  reasoning: string;
  usage?: Usage;
  aborted: boolean;
}

export class NvidiaError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.name = "NvidiaError";
  }
}

export interface CallOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  thinking?: boolean;
  /** force streaming on/off; defaults to the model's registry preference */
  stream?: boolean;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildBody(settings: ModelSettings, messages: ChatMessage[], opts: CallOptions, stream: boolean) {
  const def = modelDef(opts.model ?? settings.model);
  const body: Record<string, unknown> = {
    model: def.id,
    messages,
    temperature: opts.temperature ?? settings.temperature ?? def.temperature,
    top_p: opts.topP ?? settings.topP ?? def.topP,
    max_tokens: opts.maxTokens ?? settings.maxTokens ?? def.maxTokens,
    stream,
  };
  const think = opts.thinking ?? settings.thinking;
  if (def.thinking === "enable_thinking") {
    body.chat_template_kwargs = { enable_thinking: !!think };
  } else if (def.thinking === "thinking_effort") {
    body.chat_template_kwargs = { thinking: !!think, reasoning_effort: think ? "high" : "low" };
  }
  return body;
}

async function doFetch(
  settings: ModelSettings,
  model: string,
  body: unknown,
  signal: AbortSignal | undefined,
  accept: string,
): Promise<Response> {
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
        Authorization: `Bearer ${keyFor(settings, model)}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    // network/CORS — retryable
    throw new NvidiaError(0, `Network error reaching NIM (${settings.baseUrl}).`, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.error?.message || j.message || detail;
    } catch {
      /* raw */
    }
    const retryable = res.status === 429 || res.status === 408 || res.status >= 500;
    throw new NvidiaError(res.status, `NIM ${res.status}: ${detail || res.statusText}`, retryable);
  }
  return res;
}

/** Retry wrapper with exponential backoff + jitter. */
async function withRetry<T>(fn: () => Promise<T>, retries: number, signal?: AbortSignal): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      if (e?.name === "AbortError" || signal?.aborted) throw e;
      const retryable = e instanceof NvidiaError ? e.retryable : true;
      if (!retryable || attempt >= retries) throw e;
      const delay = Math.min(8000, 700 * 2 ** attempt) + Math.random() * 400;
      attempt++;
      await sleep(delay);
    }
  }
}

async function streamOnce(
  settings: ModelSettings,
  model: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const res = await doFetch(settings, model, body, signal, "text/event-stream");
  if (!res.body) throw new NvidiaError(0, "No response body from NIM.", true);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";
  let usage: Usage | undefined;

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
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
  return { content, reasoning, usage, aborted: false };
}

async function jsonOnce(
  settings: ModelSettings,
  model: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const res = await doFetch(settings, model, body, signal, "application/json");
  const j = await res.json();
  const msg = j.choices?.[0]?.message ?? {};
  const content: string = msg.content ?? "";
  const reasoning: string = msg.reasoning ?? msg.reasoning_content ?? "";
  const usage: Usage | undefined = j.usage;
  // emit as one chunk so the UI still updates
  if (reasoning) handlers.onReasoning?.(reasoning);
  if (content) handlers.onContent?.(content);
  if (usage) handlers.onUsage?.(usage);
  return { content, reasoning, usage, aborted: false };
}

/**
 * Main entry. Picks streaming or JSON based on the model, retries transient
 * failures, and — if a stream dies before producing content — falls back to a
 * single non-streaming request so a run never silently ends empty.
 */
export async function runCompletion(
  settings: ModelSettings,
  messages: ChatMessage[],
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
  opts: CallOptions = {},
): Promise<StreamResult> {
  const model = opts.model ?? settings.model;
  const def = modelDef(model);
  const wantStream = opts.stream ?? def.stream;
  const retries = opts.retries ?? 3;

  try {
    return await withRetry(
      async () => {
        if (wantStream) {
          const r = await streamOnce(settings, model, buildBody(settings, messages, opts, true), handlers, signal);
          // stream ended with nothing → treat as transient and retry/fallback
          if (!r.content && !r.reasoning) throw new NvidiaError(0, "Empty stream", true);
          return r;
        }
        return await jsonOnce(settings, model, buildBody(settings, messages, opts, false), handlers, signal);
      },
      retries,
      signal,
    );
  } catch (e: any) {
    if (e?.name === "AbortError") return { content: "", reasoning: "", aborted: true };
    // last-ditch: one non-streaming attempt
    if (wantStream) {
      try {
        return await jsonOnce(settings, model, buildBody(settings, messages, opts, false), handlers, signal);
      } catch (e2: any) {
        if (e2?.name === "AbortError") return { content: "", reasoning: "", aborted: true };
        throw e2;
      }
    }
    throw e;
  }
}

/** Back-compat alias used by the agent loop. */
export async function streamChat(
  settings: ModelSettings,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  overrides?: CallOptions,
): Promise<StreamResult> {
  return runCompletion(settings, messages, handlers, signal, overrides ?? {});
}

/** Simple non-streaming call returning just the content string. */
export async function completeOnce(
  settings: ModelSettings,
  messages: ChatMessage[],
  opts: CallOptions = {},
  signal?: AbortSignal,
): Promise<string> {
  const r = await runCompletion(settings, messages, {}, signal, { ...opts, stream: false });
  return r.content;
}

/** Rough token estimate (chars/3.6) — avoids shipping a tokenizer. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 3.6);
}
