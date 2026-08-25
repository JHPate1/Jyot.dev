/**
 * Seeker Code — settings are intentionally minimal.
 * The user only ever sees one field: API Key (sk_seeker_…).
 *
 * All traffic goes through the branded Seeker API gateway which:
 *  - validates the key
 *  - enforces daily message limits
 *  - maps seeker-* models → real NVIDIA models server-side
 */

/** Branded gateway. Falls back to NVIDIA direct only if unset (dev escape hatch). */
export const DEFAULT_BASE_URL =
  (import.meta as any).env?.VITE_SEEKER_API_URL ||
  (import.meta as any).env?.VITE_NVIDIA_BASE_URL ||
  "https://integrate.api.nvidia.com/v1";

/** Default Seeker key shipped for demos. Replace via Settings or VITE_SEEKER_API_KEY. */
export const DEFAULT_API_KEY =
  (import.meta as any).env?.VITE_SEEKER_API_KEY ||
  (import.meta as any).env?.VITE_NVIDIA_API_KEY ||
  "";

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
  apiKey: DEFAULT_API_KEY,
};

const KEY = "seeker:settings:v1";
const LEGACY_KEYS = ["kode:settings:v1", "nvide:settings:v1"];

export function loadSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem(KEY) || LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.apiKey === "string") return { apiKey: parsed.apiKey };
    return DEFAULT_SETTINGS;
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

/** Fetch remaining daily quota from the Seeker gateway. */
export async function fetchUsage(apiKey: string, baseUrl = DEFAULT_BASE_URL): Promise<{
  day: string;
  used: number;
  limit: number;
  remaining: number;
  label?: string;
} | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/usage`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
