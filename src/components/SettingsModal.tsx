import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, RotateCcw, X, Settings2 } from "lucide-react";
import { useIde } from "@/store/ide";
import { DEFAULT_API_KEY, DEFAULT_BASE_URL, fetchUsage } from "@/lib/ai/config";
import { cn } from "@/utils/cn";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, toast } = useIde();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState<null | "ok" | "fail" | "run">(null);
  const [localKey, setLocalKey] = useState(settings.apiKey);
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number; day: string } | null>(null);

  const refreshUsage = async (key: string) => {
    const u = await fetchUsage(key, DEFAULT_BASE_URL);
    if (u) setUsage(u);
    else setUsage(null);
  };

  useEffect(() => {
    if (settings.apiKey) refreshUsage(settings.apiKey);
  }, [settings.apiKey]);

  const test = async () => {
    setTesting("run");
    try {
      const base = DEFAULT_BASE_URL.replace(/\/$/, "");
      // Prefer the branded usage endpoint — proves key + gateway in one call
      const usageRes = await fetch(`${base}/usage`, {
        headers: { Authorization: `Bearer ${localKey}` },
      });
      if (usageRes.ok) {
        const u = await usageRes.json();
        setUsage(u);
        setTesting("ok");
        toast("Seeker API key is working", "ok");
        setSettings({ apiKey: localKey });
        return;
      }
      // Fallback: ping chat/completions (works if pointed at raw NVIDIA too)
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localKey}` },
        body: JSON.stringify({
          model: "seeker-pro-1.2",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 4,
          stream: false,
        }),
      });
      if (r.ok) {
        setTesting("ok");
        toast("API key is working", "ok");
        setSettings({ apiKey: localKey });
      } else {
        setTesting("fail");
        const err = await r.json().catch(() => ({}));
        toast(err?.error?.message || `Key check failed (${r.status})`, "error");
      }
    } catch {
      setTesting("fail");
      toast("Could not reach Seeker servers", "error");
    }
  };

  const save = () => {
    setSettings({ apiKey: localKey });
    toast("API key saved", "ok");
    onClose();
  };

  const pct = usage ? Math.min(100, Math.round((usage.used / Math.max(1, usage.limit)) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#17191e] shadow-2xl anim-in">
        <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-slate-300">
            <Settings2 size={16} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-white">Settings</div>
            <div className="text-[11.5px] text-slate-400">Your Seeker API key unlocks all three assistants</div>
          </div>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/8 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          <label className="mb-2 block text-[12px] font-medium text-slate-200">Seeker API Key</label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#121418] px-3 py-2 focus-within:border-indigo-500/40">
            <KeyRound size={14} className="shrink-0 text-slate-500" />
            <input
              type={showKey ? "text" : "password"}
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="sk_seeker_…"
              className="min-w-0 flex-1 bg-transparent py-1 font-mono text-[13px] text-white outline-none placeholder:text-slate-600"
            />
            <button onClick={() => setShowKey((s) => !s)} className="rounded p-1 text-slate-500 hover:text-slate-200">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
            One key works for Seeker Pro 1.2, Seeker Perplex, and Seeker Code Flash. It is stored only in this browser. Keys look like <span className="font-mono text-slate-300">sk_seeker_…</span>
          </p>

          {usage && (
            <div className="mt-4 rounded-xl border border-white/8 bg-[#121418] p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="font-medium text-slate-200">Today's usage</span>
                <span className="font-mono text-slate-400">
                  {usage.used} / {usage.limit} messages
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-indigo-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] text-slate-500">
                {usage.remaining} left today · resets midnight UTC ({usage.day})
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={test}
              className={cn(
                "rounded-lg border px-3.5 py-2 text-[12.5px] font-medium transition",
                testing === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : testing === "fail"
                    ? "border-red-500/30 bg-red-500/15 text-red-300"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              )}
            >
              {testing === "run" ? (
                "Checking…"
              ) : testing === "ok" ? (
                <span className="flex items-center gap-1.5">
                  <Check size={14} /> Key works
                </span>
              ) : (
                "Test Key"
              )}
            </button>
            {DEFAULT_API_KEY && (
              <button
                onClick={() => {
                  setLocalKey(DEFAULT_API_KEY);
                  setTesting(null);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                <RotateCcw size={13} /> Use default
              </button>
            )}
            <button onClick={save} className="ml-auto rounded-lg bg-indigo-600 px-4 py-2 text-[12.5px] font-medium text-white hover:bg-indigo-500">
              Save & Close
            </button>
          </div>

          <div className="mt-4 text-[10.5px] text-slate-600">
            Gateway: <span className="font-mono">{DEFAULT_BASE_URL}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
