import { useEffect, useState } from "react";
import { Activity, HardDrive, Radio } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function StatusBar() {
  const { fs, backendLabel, buffers, activeTab, totalTokens, running, externalChanges } = useIde();
  const [heap, setHeap] = useState(0);

  useEffect(() => {
    const mem = (performance as any).memory;
    if (!mem) return;
    const t = setInterval(() => setHeap(Math.round(mem.usedJSHeapSize / 1048576)), 2500);
    return () => clearInterval(t);
  }, []);

  const buf = activeTab ? buffers[activeTab] : null;
  const budgetPct = Math.min(100, (heap / 500) * 100);

  return (
    <div className="flex h-[26px] shrink-0 items-center gap-3 border-t border-white/6 bg-[#121418] px-3 text-[11.5px] text-slate-400">
      <span className="flex items-center gap-1.5">
        <HardDrive size={12} className={fs ? "text-indigo-400" : "text-slate-600"} />
        <span className={fs ? "text-slate-200" : ""}>{fs ? `${fs.rootName} • ${backendLabel}` : "No folder opened"}</span>
      </span>

      {fs && (
        <span className="flex items-center gap-1.5">
          <Radio size={12} className={externalChanges.length ? "text-amber-400" : "text-slate-600"} />
          {externalChanges.length ? `${externalChanges.length} file updated` : "Watching for changes"}
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {buf && (
          <span className="text-[11px]">
            {buf.content.split("\n").length} lines
            {buf.dirty && <span className="ml-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">Unsaved</span>}
          </span>
        )}
        <span className="text-[11px]">
          {running ? "Seeker working…" : "Ready"} • {totalTokens.toLocaleString()} tokens
        </span>
        {!!heap && (
          <span className="flex items-center gap-1.5 text-[11px]" title="Memory">
            <Activity size={12} className={cn(budgetPct > 80 ? "text-red-400" : budgetPct > 55 ? "text-amber-400" : "text-slate-500")} />
            <span>{heap} MB</span>
          </span>
        )}
      </div>
    </div>
  );
}
