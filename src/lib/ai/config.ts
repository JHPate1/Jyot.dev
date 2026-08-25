/**
 * Seeker Code settings.
 * User-facing: ONE thing only — API key (optional).
 * Everything else is built-in.
 */

// Built-in key so the app works out of the box. Change only if yours stops working.
export const BUILT_IN_KEY =
  (import.meta as any).env?.VITE_NVIDIA_API_KEY ||
  "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";

export const DEFAULT_BASE_URL =
  (import.meta as any).env?.VITE_NVIDIA_BASE_URL || "/api/nim/v1";

export const INTERNAL_DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
  contextFiles: 8,
  maxAgentSteps: 12,
  autoApply: false,
} as const;

export interface ModelSettings {
  apiKey: string;
}

export const DEFAULT_SETTINGS: ModelSettings = {
  apiKey: BUILT_IN_KEY,
};

const KEY = "seeker:settings:v1";
const LEGACY_KEYS = ["kode:settings:v1", "nvide:settings:v1"];

export function loadSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem(KEY) || LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const apiKey = typeof parsed?.apiKey === "string" && parsed.apiKey.trim() ? parsed.apiKey.trim() : BUILT_IN_KEY;
    return { apiKey };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ModelSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ apiKey: s.apiKey || BUILT_IN_KEY }));
  } catch {
    /* ignore */
  }
}
