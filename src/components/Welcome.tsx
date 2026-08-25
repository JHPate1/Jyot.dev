import { AlertCircle, Code2, FolderOpen, HardDrive, HelpCircle, Play, ShieldCheck } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function Welcome() {
  const { caps, connectLocal, useOPFS, useDemo, needsGesture, restoredName, reconnect, fsError, setPanel } = useIde();

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-2xl anim-in">
        <div className="mb-8 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-ink-800 text-nv-400">
            <Code2 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[21px] font-semibold tracking-tight text-slate-100">Kode</h1>
              <span className="rounded border border-white/10 bg-ink-800 px-2 py-0.5 text-[11px] text-slate-400">Code Editor</span>
            </div>
            <p className="text-[13px] text-slate-400">Open your project folder right in your browser and code with smart AI help.</p>
          </div>
        </div>

        {needsGesture && (
          <button
            onClick={reconnect}
            className="mb-4 flex w-full items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left transition hover:bg-amber-500/15"
          >
            <ShieldCheck size={18} className="text-amber-400" />
            <div className="flex-1">
              <div className="text-[13px] font-medium text-amber-200">Reconnect to folder "{restoredName}"</div>
              <div className="text-[11.5px] text-amber-200/75">Your browser asks for permission again after a page reload. Click here to resume editing.</div>
            </div>
          </button>
        )}

        {fsError && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
            <div className="text-[12.5px] text-red-200">{fsError}</div>
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-3">
          <Card
            icon={HardDrive}
            title="Open Folder on Computer"
            desc="Choose any folder on your PC or Mac. Saves changes straight to your files."
            badge={caps.fsa ? "Recommended" : "Not supported"}
            disabled={!caps.fsa}
            primary
            onClick={connectLocal}
          />
          <Card
            icon={FolderOpen}
            title="Private Browser Folder"
            desc="Use a private folder stored safely inside this browser tab."
            badge={caps.opfs ? "Available" : "Not supported"}
            disabled={!caps.opfs}
            onClick={useOPFS}
          />
          <Card
            icon={Play}
            title="Try Sample Project"
            desc="Explore Kode right away with a small sample shopping-cart project."
            badge="Instant Demo"
            onClick={useDemo}
          />
        </div>

        <div className="mt-7 rounded-xl border border-white/8 bg-ink-900/70 p-4.5">
          <div className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Why Kode?</div>
          <div className="grid gap-2.5 text-[12.5px] text-slate-300 sm:grid-cols-2">
            <div>
              <span className="font-medium text-white">Private by default:</span> Your files stay on your computer and never upload to a cloud server.
            </div>
            <div>
              <span className="font-medium text-white">Safe review:</span> AI suggestions appear as clear before/after changes you approve first.
            </div>
            <div>
              <span className="font-medium text-white">Fast project search:</span> Find any file or word in your project in milliseconds.
            </div>
            <div>
              <span className="font-medium text-white">Lightweight & responsive:</span> Runs smoothly on laptops without slowing down your browser.
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-[12px] text-slate-400">
          <button
            onClick={() => setPanel("blueprint")}
            className="flex items-center gap-1.5 hover:text-slate-200"
          >
            <HelpCircle size={14} /> Read User Guide &amp; Technical Details
          </button>
          <span className="font-mono text-[11px] text-slate-500">Press ⌘P or Ctrl+P to find files</span>
        </div>
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, desc, badge, disabled, primary, onClick }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex flex-col items-start rounded-xl border p-4 text-left transition",
        disabled
          ? "cursor-not-allowed border-white/5 bg-ink-900/40 opacity-40"
          : primary
            ? "border-nv-500/40 bg-nv-500/10 hover:border-nv-500/60 hover:bg-nv-500/15"
            : "border-white/8 bg-ink-850/80 hover:border-white/16 hover:bg-ink-800",
      )}
    >
      <div className="mb-2.5 flex w-full items-center justify-between">
        <Icon size={18} className={cn(primary ? "text-nv-400" : "text-slate-400")} />
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10.5px] font-medium",
            primary ? "bg-nv-500/20 text-nv-300" : "bg-ink-700 text-slate-300",
          )}
        >
          {badge}
        </span>
      </div>
      <div className="text-[13.5px] font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-[12px] leading-relaxed text-slate-400">{desc}</div>
    </button>
  );
}
