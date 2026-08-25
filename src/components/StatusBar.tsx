import { useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, Radio } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function StatusBar() {
  const { fs, backendLabel, buffers, activeTab, totalTokens, running, externalChanges, settings } = useIde();
  const [heap, setHeap] = useState(0);

  useEffect(() => {
    const mem = (performance as any).memory;
    if (!mem) return;
    const t = setInterval(() => setHeap(Math.round(mem.usedJSHeapSize / 1048576)), 2000);
    return () => clearInterval(t);
  }, []);

  const buf = activeTab ? buffers[activeTab] : null;
  const budgetPct = Math.min(100, (heap / 500) * 100);

  return (
    <div className="flex h-[24px] shrink-0 items-center gap-3 border-t border-white/6 bg-ink-900 px-3 text-[11.5px] text-slate-400">
      <span className="flex items-center gap-1.5">
        <HardDrive size={11} className={fs ? "text-nv-400" : "text-slate-600"} />
        <span className={fs ? "text-slate-300" : ""}>{fs ? `${fs.rootName} (${backendLabel})` : "No folder opened"}</span>
      </span>

      {fs && (
        <span className="flex items-center gap-1.5">
          <Radio size={11} className={externalChanges.length ? "text-amber-400" : "text-slate-600"} />
          {externalChanges.length ? `${externalChanges.length} file updated on disk` : "Auto-saving & watching"}
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {buf && (
          <span className="font-mono text-[11px]">
            {buf.content.split("\n").length} lines
            {buf.dirty && <span className="ml-1.5 text-amber-400">● Unsaved</span>}
          </span>
        )}
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          {running ? "Assistant working..." : "Ready"} · {totalTokens.toLocaleString()} words used
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px]" title="AI Model">
          <Cpu size={11} className="text-slate-500" />
          <span>{settings.model.split("/").pop()?.slice(0, 26)}</span>
        </span>
        {!!heap && (
          <span className="flex items-center gap-1.5 font-mono text-[11px]" title="Memory used">
            <Activity size={11} className={cn(budgetPct > 80 ? "text-red-400" : budgetPct > 55 ? "text-amber-400" : "text-slate-400")} />
            <span>{heap} MB</span>
          </span>
        )}
      </div>
    </div>
  );
}
