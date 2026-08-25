import type { CallProfile } from "./nvidiaClient";

/**
 * The multi-agent roster. Each entry is a full NIM profile — its own key,
 * model, sampling and thinking flags, plus the role it plays in the swarm.
 *
 * Key 1 drives Nemotron (the architect). Key 2 drives DeepSeek + Llama.
 */
export interface AgentProfile extends CallProfile {
  id: string;
  label: string;
  short: string; // 2-3 letter tag for the board
  role: string; // what this agent is good at
  maxSteps: number;
  color: string; // tailwind-ish hex for the UI
  isArchitect?: boolean;
  enabled: boolean;
}

const KEY1 = "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";
const KEY2 = "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";

export const AGENTS: AgentProfile[] = [
  {
    id: "nemotron",
    label: "Nemotron Super 120B",
    short: "NO",
    model: "nvidia/nemotron-3-super-120b-a12b",
    apiKey: KEY1,
    role: "Architect & supervisor — plans the work, decomposes tasks, reviews results.",
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    chatTemplateKwargs: { enable_thinking: true },
    maxSteps: 6,
    color: "#3b82f6",
    isArchitect: true,
    enabled: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek V4 Flash",
    short: "DS",
    model: "deepseek-ai/deepseek-v4-flash-0731",
    apiKey: KEY2,
    role: "Fast implementer — writes, fixes and wires up code with deep reasoning.",
    temperature: 1,
    topP: 0.95,
    maxTokens: 16384,
    chatTemplateKwargs: { thinking: true, reasoning_effort: "high" },
    maxSteps: 6,
    color: "#34d399",
    enabled: true,
  },
  {
    id: "llama",
    label: "Llama 3.3 70B",
    short: "LM",
    model: "meta/llama-3.3-70b-instruct",
    apiKey: KEY2,
    role: "Refactorer & reviewer — cleanups, edge cases, and careful rewrites.",
    temperature: 0.2,
    topP: 0.7,
    maxTokens: 1024,
    chatTemplateKwargs: {},
    maxSteps: 6,
    color: "#a78bfa",
    enabled: true,
  },
];

export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));
export const ARCHITECT = AGENTS.find((a) => a.isArchitect)!;

export function toProfile(a: AgentProfile): CallProfile {
  const { apiKey, model, temperature, topP, maxTokens, chatTemplateKwargs } = a;
  return { apiKey, model, temperature, topP, maxTokens, chatTemplateKwargs };
}

/** Persisted, user-editable roster (settings). Defaults to AGENTS. */
const KEY = "kode:agents:v1";

export function loadAgents(): AgentProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return AGENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return AGENTS;
    // merge with defaults so new fields/roles survive schema changes
    return parsed.map((p: any) => {
      const def = AGENT_BY_ID.get(p.id) ?? AGENTS[0];
      return { ...def, ...p };
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
