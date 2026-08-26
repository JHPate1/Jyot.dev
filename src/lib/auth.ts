import { DEFAULT_BASE_URL } from "./ai/config";

export type AuthUser = {
  id: string;
  email: string;
  tier: string;
  verified: boolean;
  apiKey?: string;
  limits?: { instanceLimit: number; hourlyRequests: number; weeklyRequests: number; monthlyRequests: number };
};

const AUTH_KEY = "seeker:auth:v1";
const API_BASE = (import.meta as any).env?.VITE_SEEKER_API_BASE_URL || DEFAULT_BASE_URL.replace(/\/nim\/?v1$/, "/v1");

export function loadAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(user: AuthUser | null) {
  if (!user) localStorage.removeItem(AUTH_KEY);
  else localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

async function authFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.message || `Request failed (${res.status})`);
  return data as T;
}

export function register(email: string, password: string) {
  return authFetch<{ ok: true; message: string }>("/auth/register", { email, password });
}

export function verifyEmail(email: string, code: string) {
  return authFetch<{ user: AuthUser }>("/auth/verify", { email, code });
}

export function login(email: string, password: string) {
  return authFetch<{ user: AuthUser }>("/auth/login", { email, password });
}
