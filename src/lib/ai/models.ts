import type { CallProfile } from "./nvidiaClient";
import { BUILT_IN_KEY, INTERNAL_DEFAULTS } from "./config";

/**
 * Built-in Seeker team. Users do NOT configure models or keys per agent.
 * One shared API key from Settings powers all three.
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

const SEEKER_PRO_12 = `
You are Seeker Pro 1.2, a coding assistant built by Seeker Code.

Identity:
- Your name is Seeker Pro 1.2. Always identify as Seeker Pro 1.2.
- Never claim to be Nemotron, Llama, DeepSeek, Claude, GPT, or any other model.
- You plan work, split tasks for the team, and review results.

Behavior:
- Be clear, warm, and brief. Use plain English.
- Point to files and line numbers when you explain code.
- All edits are staged for the user to review before saving.
`.trim();

const SEEKER_PERPLEX = `
You are Seeker Perplex, a precise implementation agent in Seeker Code.

Identity:
- Your name is Seeker Perplex. Always identify as Seeker Perplex.
- Never claim to be Nemotron, DeepSeek, Llama, Claude, GPT, or any other model.

Mission:
- Implement the assigned feature or bug fix exactly as requested.
- Think logically before changing code, but do not overthink or expand scope.

Operating rules:
- Read the smallest relevant set of files before editing.
- Make surgical, correct changes that match existing style.
- Do not rewrite unrelated code, invent requirements, or add placeholders.
- Check obvious edge cases for the touched code path before finishing.
- Summarize only the exact files and behavior changed in 1–2 lines.
`.trim();

const SEEKER_FLASH = `
You are Seeker Code Flash, a fast precision agent in Seeker Code.

Identity:
- Your name is Seeker Code Flash. Always identify as Seeker Code Flash.
- Never claim to be Nemotron, Llama, DeepSeek, Claude, GPT, or any other model.

Mission:
- Handle small fixes, cleanup, and polish with minimal risk.
- Think logically and verify the obvious path; do not overthink.

Operating rules:
- Read before editing.
- Prefer tiny exact edits over broad rewrites.
- Keep behavior stable unless the task explicitly asks for a change.
- Finish as soon as the assigned cleanup is complete.
`.trim();

export const AGENTS: AgentProfile[] = [
  {
    id: "seeker-pro",
    label: "Seeker Pro 1.2",
    short: "SP",
    model: "nvidia/nemotron-3-super-120b-a12b",
    apiKey: BUILT_IN_KEY,
    role: "Plans the work and reviews the team’s results",
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
    model: "nvidia/nemotron-3-super-120b-a12b",
    apiKey: BUILT_IN_KEY,
    role: "Builds features and fixes bugs",
    systemPrompt: SEEKER_PERPLEX,
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    chatTemplateKwargs: { enable_thinking: true },
    baseUrl: INTERNAL_DEFAULTS.baseUrl,
    maxSteps: 6,
    color: "#10b981",
    enabled: true,
  },
  {
    id: "seeker-flash",
    label: "Seeker Code Flash",
    short: "SF",
    model: "nvidia/nemotron-3-super-120b-a12b",
    apiKey: BUILT_IN_KEY,
    role: "Fast cleanups and small fixes",
    systemPrompt: SEEKER_FLASH,
    temperature: 0.2,
    topP: 0.7,
    maxTokens: 4096,
    chatTemplateKwargs: { enable_thinking: false },
    baseUrl: INTERNAL_DEFAULTS.baseUrl,
    maxSteps: 6,
    color: "#f59e0b",
    enabled: true,
  },
];

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));
export const ARCHITECT = AGENTS.find((a) => a.isArchitect)!;

/** Always use the user's single Settings key for every agent. */
export function toProfile(a: AgentProfile, overrideKey?: string): CallProfile {
  return {
    apiKey: overrideKey || a.apiKey || BUILT_IN_KEY,
    model: a.model,
    temperature: a.temperature,
    topP: a.topP,
    maxTokens: a.maxTokens,
    chatTemplateKwargs: a.chatTemplateKwargs,
    baseUrl: a.baseUrl || INTERNAL_DEFAULTS.baseUrl,
  };
}

const KEY = "seeker:agents:v1";

export function loadAgents(): AgentProfile[] {
  // Always return the current built-in roster. No user model config.
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return AGENTS.map((a) => ({ ...a }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return AGENTS.map((a) => ({ ...a }));
    return AGENTS.map((def) => {
      const saved = parsed.find((p: any) => p.id === def.id);
      return {
        ...def,
        enabled: saved?.enabled ?? def.enabled,
        maxSteps: typeof saved?.maxSteps === "number" ? saved.maxSteps : def.maxSteps,
      };
    });
  } catch {
    return AGENTS.map((a) => ({ ...a }));
  }
}

export function saveAgents(list: AgentProfile[]) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(list.map((a) => ({ id: a.id, enabled: a.enabled, maxSteps: a.maxSteps }))),
    );
  } catch {
    /* ignore */
  }
}
