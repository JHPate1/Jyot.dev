import { useMemo, useState } from "react";
import { Regex, Search, Sparkles, Type } from "lucide-react";
import { useIde } from "@/store/ide";
import { cn } from "@/utils/cn";

export default function SearchPanel() {
  const { index, indexVersion, openFile, indexing } = useIde();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"semantic" | "grep">("semantic");
  const [regex, setRegex] = useState(false);
  void indexVersion;

  const results = useMemo(() => {
    if (!q.trim() || !index.ready) return null;
    return mode === "semantic"
      ? { kind: "sem" as const, items: index.search(q, 20) }
      : { kind: "grep" as const, items: index.grep(q, { regex, max: 120 }) };
  }, [q, mode, regex, index, indexVersion]);

  const stats = index.stats();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-white/6 p-2.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-ink-850 px-2 focus-within:border-nv-500/40">
          <Search size={13} className="shrink-0 text-slate-600" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "semantic" ? "Retrieve relevant code (BM25 + symbols)…" : "Find in files…"}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-slate-200 outline-none placeholder:text-slate-600"
          />
          {mode === "grep" && (
            <button onClick={() => setRegex((r) => !r)} title="Regex" className={cn("rounded p-1", regex ? "bg-nv-500/20 text-nv-300" : "text-slate-600 hover:text-slate-300")}>
              <Regex size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {([["semantic", Sparkles, "Retrieval"], ["grep", Type, "Literal"]] as const).map(([m, Icon, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-[11px]", mode === m ? "bg-nv-500/15 text-nv-300" : "text-slate-500 hover:text-slate-300")}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-slate-700">
            {indexing ? "indexing…" : `${stats.files} files · ${stats.chunks} chunks · ${stats.terms} terms`}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!results && <div className="px-3 py-8 text-center text-[11.5px] text-slate-600">Type to search the indexed workspace</div>}
        {results?.kind === "sem" &&
          results.items.map((h, i) => (
            <button key={i} onClick={() => openFile(h.path)} className="block w-full border-b border-white/5 px-3 py-2 text-left hover:bg-white/4">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-[11px] text-sky-300">{h.path}</span>
                <span className="font-mono text-[9.5px] text-slate-600">:{h.start}-{h.end}</span>
                <span className="ml-auto rounded bg-nv-500/12 px-1 font-mono text-[9px] text-nv-400">{h.score}</span>
              </div>
              <pre className="mt-1 max-h-16 overflow-hidden font-mono text-[10.5px] leading-snug whitespace-pre-wrap text-slate-500">{h.preview.slice(0, 260)}</pre>
            </button>
          ))}
        {results?.kind === "grep" &&
          results.items.map((h, i) => (
            <button key={i} onClick={() => openFile(h.path)} className="flex w-full items-baseline gap-2 border-b border-white/5 px-3 py-1 text-left hover:bg-white/4">
              <span className="shrink-0 font-mono text-[10.5px] text-sky-400/80">{h.path.split("/").pop()}:{h.line}</span>
              <span className="truncate font-mono text-[10.5px] text-slate-400">{h.text}</span>
            </button>
          ))}
        {results && !results.items.length && <div className="px-3 py-8 text-center text-[11.5px] text-slate-600">No matches</div>}
      </div>
    </div>
  );
}
