export const DEFAULT_API_KEY =
  (import.meta as any).env?.VITE_NVIDIA_API_KEY ||
  "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";

export const DEFAULT_BASE_URL =
  (import.meta as any).env?.VITE_NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

export const DEFAULT_MODEL =
  (import.meta as any).env?.VITE_NVIDIA_MODEL || "nvidia/nemotron-3-super-120b-a12b";

export const MODEL_OPTIONS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "qwen/qwen3-coder-480b-a35b-instruct",
  "moonshotai/kimi-k2-instruct",
  "meta/llama-3.3-70b-instruct",
  "deepseek-ai/deepseek-r1",
];

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
  maxAgentSteps: 12,
  contextFiles: 8,
  inlineCompletion: false,
};

const KEY = "kode:settings:v1";
const LEGACY_KEY = "nvide:settings:v1";

export function loadSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
