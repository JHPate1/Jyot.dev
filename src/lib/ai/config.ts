/**
 * Model registry + settings.
 *
 * Kode can talk to several NIM models at once (one per agent instance). Each
 * model may need a different API key, different sampling defaults, and a
 * different "thinking" switch (Nemotron uses enable_thinking, DeepSeek v4 uses
 * thinking + reasoning_effort, Llama has none). All of that lives in the
 * registry so the client stays generic.
 */

export type ThinkingStyle = "enable_thinking" | "thinking_effort" | "none";

export interface ModelDef {
  id: string;
  label: string;
  short: string;
  /** which chat_template_kwargs flavour this model expects */
  thinking: ThinkingStyle;
  /** good defaults for this model */
  temperature: number;
  topP: number;
  maxTokens: number;
  /** streaming reliability: some models stream fine, some are better non-stream */
  stream: boolean;
  /** role hint used by the orchestrator when auto-assigning instances */
  role: "planner" | "coder" | "reviewer" | "fast" | "general";
  blurb: string;
}

export const MODEL_REGISTRY: ModelDef[] = [
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    label: "Nemotron 3 Super 120B",
    short: "Nemotron-120B",
    thinking: "enable_thinking",
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    stream: true,
    role: "planner",
    blurb: "Frontier reasoning. Best for planning and hard multi-file logic.",
  },
  {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    short: "DeepSeek-V4",
    thinking: "thinking_effort",
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    stream: false,
    role: "coder",
    blurb: "Fast, strong coder with high reasoning effort. Great for edits.",
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B Instruct",
    short: "Llama-70B",
    thinking: "none",
    temperature: 0.2,
    topP: 0.7,
    maxTokens: 1024,
    stream: false,
    role: "reviewer",
    blurb: "Low-temperature, deterministic. Ideal for review and quick checks.",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    label: "Nemotron Super 49B",
    short: "Nemotron-49B",
    thinking: "enable_thinking",
    temperature: 0.6,
    topP: 0.95,
    maxTokens: 8192,
    stream: true,
    role: "general",
    blurb: "Balanced mid-size reasoning model.",
  },
  {
    id: "qwen/qwen3-coder-480b-a35b-instruct",
    label: "Qwen3 Coder 480B",
    short: "Qwen3-Coder",
    thinking: "none",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 16384,
    stream: true,
    role: "coder",
    blurb: "Large dedicated coding model.",
  },
];

export function modelDef(id: string): ModelDef {
  return MODEL_REGISTRY.find((m) => m.id === id) ?? MODEL_REGISTRY[0];
}

export const MODEL_OPTIONS = MODEL_REGISTRY.map((m) => m.id);

// ─── API keys ────────────────────────────────────────────────────────────────
// One default key covers every model, but the user can override per model in
// Settings (some accounts have separate keys / quotas per family).
export const DEFAULT_API_KEY =
  (import.meta as any).env?.VITE_NVIDIA_API_KEY ||
  "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";

/** Optional per-model keys. Falls back to DEFAULT_API_KEY. */
export const MODEL_KEYS: Record<string, string> = {
  "deepseek-ai/deepseek-v4-flash-0731": "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",
  "meta/llama-3.3-70b-instruct": "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",
};

export const DEFAULT_BASE_URL =
  (import.meta as any).env?.VITE_NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

export const DEFAULT_MODEL =
  (import.meta as any).env?.VITE_NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";

export interface ModelSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  thinking: boolean;
  autoApply: boolean;
  maxAgentSteps: number;
  contextFiles: number;
  inlineCompletion: boolean;
  /** per-model key overrides, keyed by model id */
  modelKeys: Record<string, string>;
  /** multi-agent orchestration on/off */
  multiAgent: boolean;
  /** which models power the planner / coder / reviewer roles */
  plannerModel: string;
  coderModel: string;
  reviewerModel: string;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  apiKey: DEFAULT_API_KEY,
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  temperature: 1,
  topP: 0.95,
  maxTokens: 16384,
  thinking: true,
  autoApply: false,
  maxAgentSteps: 14,
  contextFiles: 8,
  inlineCompletion: false,
  modelKeys: { ...MODEL_KEYS },
  multiAgent: false,
  plannerModel: "nvidia/nemotron-3-super-120b-a12b",
  coderModel: "deepseek-ai/deepseek-v4-flash-0731",
  reviewerModel: "meta/llama-3.3-70b-instruct",
};

/** Resolve the correct key for a given model id. */
export function keyFor(settings: ModelSettings, model: string): string {
  return settings.modelKeys?.[model] || settings.apiKey;
}

const KEY = "kode:settings:v2";
const LEGACY_KEYS = ["kode:settings:v1", "nvide:settings:v1"];

export function loadSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem(KEY) || LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, modelKeys: { ...MODEL_KEYS, ...(parsed.modelKeys ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ModelSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
