import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, RotateCcw, X, Sliders } from "lucide-react";
import { useIde } from "@/store/ide";
import { DEFAULT_SETTINGS, MODEL_OPTIONS } from "@/lib/ai/config";
import { cn } from "@/utils/cn";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-white/5 py-3">
      <div className="w-44 shrink-0">
        <div className="text-[12.5px] font-medium text-slate-200">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{hint}</div>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step, onChange, fmt }: any) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 flex-1 cursor-pointer appearance-none rounded bg-ink-700 accent-nv-500" />
      <span className="w-14 text-right font-mono text-[11.5px] text-slate-200">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={cn("relative h-5 w-9 rounded-full transition", on ? "bg-nv-500" : "bg-ink-600")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, index, toast } = useIde();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState<null | "ok" | "fail" | "run">(null);

  const test = async () => {
    setTesting("run");
    try {
      const r = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: settings.model, messages: [{ role: "user", content: "ping" }], max_tokens: 4, stream: false }),
      });
      setTesting(r.ok ? "ok" : "fail");
      if (!r.ok) toast(`Connection error (${r.status})`, "error");
      else toast("API Key verified successfully", "ok");
    } catch {
      setTesting("fail");
      toast("Could not reach API server", "error");
    }
  };

  const st = index.stats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl anim-in">
        <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3.5">
          <Sliders size={16} className="text-slate-400" />
          <span className="text-[14px] font-semibold text-slate-100">Kode Settings</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-white/8 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-2">
          <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI Assistant Connection</div>

          <Row label="NVIDIA API Key" hint="Your API key stays private in your browser. Default key is pre-filled.">
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900 px-3">
                <KeyRound size={13} className="shrink-0 text-slate-400" />
                <input
                  type={showKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ apiKey: e.target.value })}
                  placeholder="nvapi-…"
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12px] text-slate-100 outline-none"
                />
                <button onClick={() => setShowKey((s) => !s)} className="shrink-0 text-slate-400 hover:text-slate-200">
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={test}
                className={cn(
                  "shrink-0 rounded-lg px-3 text-[12px] font-medium transition",
                  testing === "ok" ? "bg-emerald-500/20 text-emerald-300" : testing === "fail" ? "bg-red-500/20 text-red-300" : "bg-ink-700 text-slate-200 hover:bg-ink-600",
                )}
              >
                {testing === "run" ? "Checking..." : testing === "ok" ? <Check size={13} /> : "Test Connection"}
              </button>
            </div>
          </Row>

          <Row label="Server Address" hint="Leave as default unless using a custom proxy.">
            <input value={settings.baseUrl} onChange={(e) => setSettings({ baseUrl: e.target.value })} className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-[12px] text-slate-100 outline-none focus:border-white/25" />
          </Row>

          <Row label="AI Model">
            <input list="models" value={settings.model} onChange={(e) => setSettings({ model: e.target.value })} className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-[12px] text-slate-100 outline-none focus:border-white/25" />
            <datalist id="models">
              {MODEL_OPTIONS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </Row>

          <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Response Style</div>
          <Row label="Creativity (Temperature)"><Slider value={settings.temperature} min={0} max={2} step={0.05} onChange={(v: number) => setSettings({ temperature: v })} /></Row>
          <Row label="Show Thinking Process" hint="Shows step-by-step reasoning above assistant answers.">
            <Toggle on={settings.thinking} onChange={(v) => setSettings({ thinking: v })} />
          </Row>

          <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Safety & Review</div>
          <Row label="Save Without Review" hint="If turned on, AI edits save immediately to disk without asking you first.">
            <div className="flex items-center gap-2">
              <Toggle on={settings.autoApply} onChange={(v) => setSettings({ autoApply: v })} />
              {settings.autoApply && <span className="text-[11.5px] text-amber-400">Immediate saving enabled</span>}
            </div>
          </Row>

          <div className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Project Search Status</div>
          <Row label="Files Indexed" hint="How many files are searchable in your open project.">
            <div className="text-[12.5px] text-slate-300">
              {st.files} files · {st.chunks} text blocks
            </div>
          </Row>

          <div className="py-4">
            <button
              onClick={() => { setSettings(DEFAULT_SETTINGS); toast("Settings restored to defaults", "ok"); }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <RotateCcw size={13} /> Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
