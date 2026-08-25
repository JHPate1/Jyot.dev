import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function SearchPanel() {
  const { index, indexVersion, openFile, indexing } = useIde();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"smart" | "text">("smart");
  void indexVersion;

  const results = useMemo(() => {
    if (!q.trim() || !index.ready) return null;
    return mode === "smart"
      ? { kind: "smart" as const, items: index.search(q, 20) }
      : { kind: "text" as const, items: index.grep(q, { regex: false, max: 120 }) };
  }, [q, mode, index, indexVersion]);

  const stats = index.stats();

  return (
    <div className="flex h-full flex-col bg-[#121418]">
      <div className="space-y-2 border-b border-white/6 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#17191e] px-3 focus-within:border-indigo-500/40">
          <Search size={14} className="shrink-0 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "smart" ? "Describe what you’re looking for…" : "Find exact text in files…"} className="min-w-0 flex-1 bg-transparent py-2.5 text-[13px] text-white outline-none placeholder:text-slate-500" />
        </div>
        <div className="flex items-center gap-1.5">
          {([["smart", Sparkles, "Smart search"], ["text", Search, "Exact text"]] as const).map(([m, Icon, label]) => (
            <button key={m} onClick={() => setMode(m as any)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium", mode === m ? "bg-white text-black" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white")}>
              <Icon size={12} /> {label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-500">{indexing ? "Indexing…" : `${stats.files} files searchable`}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!results && <div className="px-4 py-10 text-center text-[13px] text-slate-500">Type to search your project</div>}
        {results?.kind === "smart" && results.items.map((h, i) => (
          <button key={i} onClick={() => openFile(h.path)} className="block w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/[0.04]">
            <div className="flex items-center gap-2"><span className="truncate font-mono text-[12px] text-indigo-300">{h.path}</span><span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{h.score}</span></div>
            <pre className="mt-1.5 max-h-16 overflow-hidden font-mono text-[11px] leading-snug whitespace-pre-wrap text-slate-400">{h.preview.slice(0, 260)}</pre>
          </button>
        ))}
        {results?.kind === "text" && results.items.map((h, i) => (
          <button key={i} onClick={() => openFile(h.path)} className="flex w-full items-baseline gap-2 border-b border-white/5 px-4 py-2 text-left hover:bg-white/[0.04]">
            <span className="shrink-0 font-mono text-[11px] text-indigo-300">{h.path.split("/").pop()}:{h.line}</span>
            <span className="truncate font-mono text-[11px] text-slate-400">{h.text}</span>
          </button>
        ))}
        {results && !results.items.length && <div className="px-4 py-10 text-center text-[13px] text-slate-500">No matches found</div>}
      </div>
    </div>
  );
}
