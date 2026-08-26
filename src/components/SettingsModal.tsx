import { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { useIde } from "@/store/ide";
import { BUILT_IN_KEY, DEFAULT_SETTINGS } from "@/lib/ai/config";
import { cn } from "@/utils/cn";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, toast } = useIde();
  const [showKey, setShowKey] = useState(false);
  const [localKey, setLocalKey] = useState(settings.apiKey || BUILT_IN_KEY);
  const [status, setStatus] = useState<"idle" | "ok" | "fail" | "run">("idle");

  const usingBuiltIn = !localKey || localKey === BUILT_IN_KEY;

  const save = () => {
    const key = localKey.trim() || BUILT_IN_KEY;
    setSettings({ apiKey: key });
    toast(key === BUILT_IN_KEY ? "Using the built-in key" : "API key saved", "ok");
    onClose();
  };

  const test = async () => {
    setStatus("run");
    const key = localKey.trim() || BUILT_IN_KEY;
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-super-120b-a12b",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 4,
          stream: false,
        }),
      });
      if (r.ok) {
        setStatus("ok");
        toast("Connected — you’re good to go", "ok");
      } else {
        setStatus("fail");
        toast(`Key didn’t work (${r.status}). Try the built-in key.`, "error");
      }
    } catch {
      setStatus("fail");
      toast("Couldn’t reach the server. Check your internet or CORS proxy.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#17191e] shadow-2xl anim-in"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold text-white">Settings</div>
            <div className="text-[12px] text-slate-400">You almost never need to change this</div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[13px] leading-relaxed text-emerald-100">
            <strong className="font-semibold text-white">Already set up.</strong>
            <br />
            Seeker Code ships with a working key. Open a folder and start chatting — no setup required.
          </div>

          <div>
            <div className="mb-1.5 text-[12px] font-medium text-slate-300">API key (optional)</div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d0e12] px-3 py-2.5">
              <input
                type={showKey ? "text" : "password"}
                value={localKey}
                onChange={(e) => {
                  setLocalKey(e.target.value);
                  setStatus("idle");
                }}
                placeholder="Leave blank to use built-in"
                className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-white outline-none placeholder:text-slate-600"
              />
              <button onClick={() => setShowKey((v) => !v)} className="text-slate-500 hover:text-white">
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
              {usingBuiltIn
                ? "Using the built-in key for Seeker Pro 1.2, Perplex, and Flash."
                : "Your custom key will be used for all three Seekers. Stored only in this browser."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={test}
              className={cn(
                "rounded-full border px-3.5 py-2 text-[12.5px] font-medium",
                status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : status === "fail"
                    ? "border-red-500/30 bg-red-500/15 text-red-300"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              )}
            >
              {status === "run" ? "Checking…" : status === "ok" ? (
                <span className="flex items-center gap-1.5">
                  <Check size={14} /> Works
                </span>
              ) : (
                "Test connection"
              )}
            </button>
            <button
              onClick={() => {
                setLocalKey(DEFAULT_SETTINGS.apiKey);
                setStatus("idle");
              }}
              className="rounded-full border border-white/10 px-3.5 py-2 text-[12.5px] text-slate-300 hover:bg-white/5"
            >
              Reset to built-in
            </button>
            <button onClick={save} className="ml-auto rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-black hover:bg-slate-100">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
