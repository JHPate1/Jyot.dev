/**
 * Seeker Code — NVIDIA NIM client (fetch + SSE)
 * Supports per-agent CallProfiles with different keys / models.
 * Includes retry with exponential backoff for 429/5xx/network issues.
 */
import { INTERNAL_DEFAULTS, type ModelSettings } from "./config";

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface CallProfile {
  apiKey: string;
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  chatTemplateKwargs?: Record<string, unknown>;
  baseUrl?: string;
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
  retriable: boolean;
  constructor(status: number, message: string, retriable = false) {
    super(message);
    this.status = status;
    this.retriable = retriable;
    this.name = "NvidiaError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function profileFromSettings(settings: ModelSettings, overrides?: Partial<CallProfile>): CallProfile {
  // Single Seeker API key from settings — gateway maps models server-side
  return {
    apiKey: overrides?.apiKey ?? settings.apiKey,
    model: overrides?.model ?? "seeker-pro-1.2",
    temperature: overrides?.temperature ?? 1,
    topP: overrides?.topP ?? 0.95,
    maxTokens: overrides?.maxTokens ?? 16384,
    chatTemplateKwargs: overrides?.chatTemplateKwargs ?? { enable_thinking: true },
    baseUrl: overrides?.baseUrl ?? INTERNAL_DEFAULTS.baseUrl,
  };
}

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    if (signal?.aborted) throw new NvidiaError(0, "Aborted", false);
    try {
      return await fn();
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") throw new NvidiaError(0, "Aborted", false);
      const retriable = e instanceof NvidiaError ? e.retriable : true;
      if (!retriable) throw e;
      lastErr = e;
      const backoff = Math.min(8000, 600 * Math.pow(2, a)) + Math.random() * 250;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function postStream(profile: CallProfile, body: Record<string, unknown>, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
  const baseUrl = (profile.baseUrl || INTERNAL_DEFAULTS.baseUrl).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${profile.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") return { content: "", reasoning: "", aborted: true };
    throw new NvidiaError(0, "Network error reaching Seeker servers — retrying.", true);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.error?.message || j.message || detail;
    } catch {}
    const retriable = res.status === 429 || res.status >= 500 || res.status === 408;
    throw new NvidiaError(res.status, `Seeker ${res.status}: ${detail || res.statusText}`, retriable);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";
  let usage: StreamResult["usage"];
  let aborted = false;

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
    if (e?.name === "AbortError") {
      aborted = true;
      return { content, reasoning, usage, aborted };
    }
    if (content.length || reasoning.length) return { content, reasoning, usage, aborted: false };
    throw new NvidiaError(0, `Stream interrupted — retrying. (${e?.message ?? e})`, true);
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return { content, reasoning, usage, aborted };
}

export async function streamChat(
  settings: ModelSettings,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
  overrides?: Partial<CallProfile>,
): Promise<StreamResult> {
  return streamProfile(profileFromSettings(settings, overrides), messages, handlers, signal);
}

export async function streamProfile(
  profile: CallProfile,
  messages: ChatMessage[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    temperature: profile.temperature ?? 1,
    top_p: profile.topP ?? 0.95,
    max_tokens: profile.maxTokens ?? 16384,
    stream: true,
    chat_template_kwargs: profile.chatTemplateKwargs ?? {},
  };
  return withRetry(() => postStream(profile, body, handlers, signal), signal);
}

export async function completeOnce(
  settings: ModelSettings,
  messages: ChatMessage[],
  overrides?: Partial<CallProfile>,
  signal?: AbortSignal,
): Promise<string> {
  return completeProfile(profileFromSettings(settings, overrides), messages, signal);
}

export async function completeProfile(profile: CallProfile, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const baseUrl = (profile.baseUrl || INTERNAL_DEFAULTS.baseUrl).replace(/\/$/, "");
  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${profile.apiKey}` },
        body: JSON.stringify({
          model: profile.model,
          messages,
          temperature: profile.temperature ?? 1,
          top_p: profile.topP ?? 0.95,
          max_tokens: profile.maxTokens ?? 16384,
          stream: false,
          chat_template_kwargs: profile.chatTemplateKwargs ?? {},
        }),
        signal,
      });
    } catch (e: any) {
      if (e?.name === "AbortError") throw new NvidiaError(0, "Aborted", false);
      throw new NvidiaError(0, "Network error — retrying.", true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text.slice(0, 300);
      try { const j = JSON.parse(text); detail = j.detail || j.error?.message || j.message || detail; } catch {}
      const retriable = res.status === 429 || res.status >= 500;
      throw new NvidiaError(res.status, `Seeker ${res.status}: ${detail || res.statusText}`, retriable);
    }
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? "";
  }, signal);
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 3.6);
}
