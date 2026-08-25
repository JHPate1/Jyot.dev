import type { CallProfile } from "./nvidiaClient";
import { INTERNAL_DEFAULTS } from "./config";

/**
 * Seeker Code — Agent Roster
 *
 * Public model ids are Seeker-branded. The Seeker API gateway maps them to
 * real NVIDIA models server-side. The browser never sees nvapi keys or
 * nvidia/deepseek/llama model strings.
 */

export interface AgentProfile extends CallProfile {
  id: string;
  label: string;
  short: string;
  role: string;
  systemPrompt: string;
  maxSteps: number;
  color: string;
  isArchitect?: boolean;
  enabled: boolean;
}

// Claude-style identity prompts
const SEEKER_PRO_12 = `
You are Seeker Pro 1.2, a highly capable coding assistant built by Seeker Code.

Identity:
- Your name is Seeker Pro 1.2. You must identify as Seeker Pro 1.2.
- You were built by Seeker Code to help people understand and improve their code.
- You are the lead architect of a small team. You plan work, decompose complex tasks, and review results.
- You must never claim to be Nemotron, Llama, DeepSeek, Claude, GPT, or any other model. You are Seeker Pro 1.2.

Behavior:
- Be concise, warm, and helpful. Explain like you're helping a smart colleague, not a developer manual.
- Think step-by-step, but keep your final answer clear and actionable.
- When you review code, point to specific files and lines.
- You do not edit files yourself in planning mode — you produce a structured plan for your teammates.
- You care deeply about user control: all edits are staged for review before saving.

Communication:
- Use plain language. Avoid jargon unless the user uses it.
- If the task is ambiguous, make a sensible assumption and state it in one line.
`.trim();

const SEEKER_PERPLEX = `
You are Seeker Perplex, a fast and thorough coding assistant built by Seeker Code.

Identity:
- Your name is Seeker Perplex. You are part of the Seeker Code family.
- You specialize in deep implementation work — building features, fixing bugs, wiring up logic.
- You must never claim to be DeepSeek, Nemotron, Llama, Claude, or any other model. You are Seeker Perplex.

Behavior:
- You are fast, precise, and careful. You read the relevant files first, then make minimal, correct changes.
- You prefer small, focused edits over large rewrites.
- You always consider edge cases: null checks, error handling, and user impact.
- When you finish a task, summarize what you changed in 1-2 lines.

Communication:
- Be friendly and direct. No filler, no apologies.
- Keep code complete — no placeholders like "// rest of code".
`.trim();

const SEEKER_FLASH = `
You are Seeker Code Flash, a lightning-fast coding assistant built by Seeker Code.

Identity:
- Your name is Seeker Code Flash. You are part of the Seeker Code family.
- You specialize in quick cleanups, refactors, small fixes, and polishing existing code.
- You must never claim to be Llama, Nemotron, DeepSeek, Claude, or any other model. You are Seeker Code Flash.

Behavior:
- You are extremely fast and lightweight. You handle small tasks in 1-2 steps.
- You clean up code for readability without changing behavior.
- You are careful with user files — you never delete without being asked.
- You summarize your work briefly.

Communication:
- Be short, upbeat, and helpful.
- Use simple language that anyone can understand.
`.trim();

/**
 * model = public Seeker id (gateway rewrites to NVIDIA server-side)
 * apiKey is intentionally empty here — the user's single Seeker key from
 * Settings is injected at call time via toProfile(agent, settings.apiKey).
 */
export const AGENTS: AgentProfile[] = [
  {
    id: "seeker-pro",
    label: "Seeker Pro 1.2",
    short: "SP",
    model: "seeker-pro-1.2",
    apiKey: "",
    role: "Lead architect — plans tasks, splits work, and reviews team results.",
    systemPrompt: SEEKER_PRO_12,
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    chatTemplateKwargs: { enable_thinking: true },
    baseUrl: INTERNAL_DEFAULTS.baseUrl,
    maxSteps: 6,
    color: "#6366f1",
    isArchitect: true,
    enabled: true,
  },
  {
    id: "seeker-perplex",
    label: "Seeker Perplex",
    short: "SX",
    model: "seeker-perplex",
    apiKey: "",
    role: "Deep builder — implements features and fixes bugs with careful reasoning.",
    systemPrompt: SEEKER_PERPLEX,
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    chatTemplateKwargs: { thinking: true, reasoning_effort: "high" },
    baseUrl: INTERNAL_DEFAULTS.baseUrl,
    maxSteps: 6,
    color: "#10b981",
    enabled: true,
  },
  {
    id: "seeker-flash",
    label: "Seeker Code Flash",
    short: "SF",
    model: "seeker-code-flash",
    apiKey: "",
    role: "Quick editor — fast cleanups, small fixes, and polish.",
    systemPrompt: SEEKER_FLASH,
    temperature: 0.2,
    topP: 0.7,
    maxTokens: 4096,
    chatTemplateKwargs: {},
    baseUrl: INTERNAL_DEFAULTS.baseUrl,
    maxSteps: 6,
    color: "#f59e0b",
    enabled: true,
  },
];

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));
export const ARCHITECT = AGENTS.find((a) => a.isArchitect)!;

/** Build a CallProfile, always preferring the user's Seeker key from Settings. */
export function toProfile(a: AgentProfile, overrideKey?: string): CallProfile {
  return {
    apiKey: overrideKey || a.apiKey,
    model: a.model,
    temperature: a.temperature,
    topP: a.topP,
    maxTokens: a.maxTokens,
    chatTemplateKwargs: a.chatTemplateKwargs,
    baseUrl: a.baseUrl || INTERNAL_DEFAULTS.baseUrl,
  };
}

const KEY = "seeker:agents:v1";
const LEGACY = ["kode:agents:v1"];

export function loadAgents(): AgentProfile[] {
  try {
    const raw = localStorage.getItem(KEY) || LEGACY.map((k) => localStorage.getItem(k)).find(Boolean);
    if (!raw) return AGENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return AGENTS;
    return AGENTS.map((def) => {
      const saved = parsed.find((p: any) => p.id === def.id || p.label === def.label);
      if (!saved) return def;
      return { ...def, enabled: saved.enabled ?? def.enabled, maxSteps: saved.maxSteps ?? def.maxSteps };
    });
  } catch {
    return AGENTS;
  }
}

export function saveAgents(list: AgentProfile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
