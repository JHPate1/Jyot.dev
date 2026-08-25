import { AlertCircle, FolderOpen, HardDrive, Play, ShieldCheck, Sparkles } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function Welcome() {
  const { caps, connectLocal, useOPFS, useDemo, needsGesture, restoredName, reconnect, fsError, setPanel } = useIde();

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-[#0d0e12] p-6">
      <div className="w-full max-w-[760px] anim-in">
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black font-bold text-[20px] shadow-lg">S</div>
            <div>
              <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-white">
                Seeker Code <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">Seeker Pro 1.2</span>
              </h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-400">Your private code editor in the browser. Open any folder on your computer, get clear explanations, and ship changes safely.</p>
            </div>
          </div>
        </div>

        {needsGesture && (
          <button onClick={reconnect} className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-left hover:bg-amber-500/15">
            <ShieldCheck size={20} className="text-amber-400" />
            <div className="flex-1">
              <div className="text-[13.5px] font-medium text-amber-200">Reconnect to “{restoredName}”</div>
              <div className="text-[12px] text-amber-200/70">Your browser needs permission again after a refresh. One click restores it.</div>
            </div>
          </button>
        )}

        {fsError && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3.5">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
            <div className="text-[13px] text-red-200">{fsError}</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            icon={HardDrive}
            title="Open your project"
            desc="Pick any folder on your Mac or PC. Edits save directly to your files."
            cta="Choose folder"
            badge={caps.fsa ? "Recommended" : "Not supported"}
            disabled={!caps.fsa}
            primary
            onClick={connectLocal}
          />
          <Card
            icon={FolderOpen}
            title="Private browser storage"
            desc="Keep files inside this browser tab. Works everywhere, no setup."
            cta="Use private storage"
            badge={caps.opfs ? "Works offline" : "Not supported"}
            disabled={!caps.opfs}
            onClick={useOPFS}
          />
          <Card
            icon={Play}
            title="Try a sample project"
            desc="See how Seeker works with a small demo shop app."
            cta="Open demo"
            badge="Instant"
            onClick={useDemo}
          />
        </div>

        <div className="mt-8 grid gap-3 rounded-2xl border border-white/8 bg-[#121418] p-5 sm:grid-cols-3">
          <Feature icon="🔒" title="Private by default" desc="Your code stays on your computer. Nothing is uploaded to a cloud." />
          <Feature icon="👀" title="Review before saving" desc="Every AI suggestion appears as a clear before/after you approve." />
          <Feature icon="⚡" title="Seeker team" desc="Seeker Pro 1.2 plans, Seeker Perplex and Seeker Code Flash build together." />
        </div>

        <div className="mt-6 flex items-center justify-between text-[12.5px]">
          <button onClick={() => setPanel("blueprint")} className="flex items-center gap-1.5 text-slate-400 hover:text-white">
            <Sparkles size={14} /> How Seeker Code works — user guide
          </button>
          <span className="font-mono text-[11px] text-slate-500">Press ⌘P to find any file</span>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, desc, cta, badge, disabled, primary, onClick }: any) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("group flex flex-col items-start rounded-2xl border p-5 text-left transition", disabled ? "cursor-not-allowed border-white/5 bg-[#121418]/40 opacity-40" : primary ? "border-white bg-white text-black hover:bg-slate-100" : "border-white/10 bg-[#17191e] hover:bg-[#1d2026] hover:border-white/15")}>
      <div className="mb-3 flex w-full items-center justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", primary ? "bg-black/10 text-black" : "bg-white/5 text-white")}><Icon size={18} /></div>
        <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", primary ? "bg-black/10 text-black/70" : "bg-white/10 text-slate-300")}>{badge}</span>
      </div>
      <div className="text-[14px] font-semibold">{title}</div>
      <div className={cn("mt-1.5 text-[12.5px] leading-relaxed", primary ? "text-black/60" : "text-slate-400")}>{desc}</div>
      <div className={cn("mt-4 rounded-full px-3 py-1.5 text-[12px] font-medium", primary ? "bg-black text-white" : "bg-white text-black")}>{cta}</div>
    </button>
  );
}

function Feature({ icon, title, desc }: any) {
  return (
    <div className="flex gap-2.5">
      <span className="text-[16px]">{icon}</span>
      <div>
        <div className="text-[13px] font-medium text-white">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{desc}</div>
      </div>
    </div>
  );
}
