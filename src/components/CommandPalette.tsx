import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, File, Terminal } from "lucide-react";
import { useIde } from "@/store/ide";
import { flattenFiles } from "@/lib/fs/types";
import { cn } from "@/utils/cn";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ commands }: { commands: Command[] }) {
  const { paletteOpen, setPalette, tree, openFile } = useIde();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQ("");
    setSel(0);
    if (paletteOpen) setTimeout(() => inputRef.current?.focus(), 10);
  }, [paletteOpen]);

  const files = useMemo(() => (tree ? flattenFiles(tree).map((f) => f.path) : []), [tree]);

  const items = useMemo(() => {
    if (paletteOpen === "files") {
      const ql = q.toLowerCase();
      return files
        .filter((f) => f.toLowerCase().includes(ql))
        .sort((a, b) => a.length - b.length)
        .slice(0, 40)
        .map((f) => ({ id: f, label: f.split("/").pop()!, hint: f, run: () => openFile(f) }));
    }
    const ql = q.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(ql)).slice(0, 40);
  }, [q, paletteOpen, files, commands, openFile]);

  if (!paletteOpen) return null;

  const exec = (i: number) => {
    const it = items[i];
    if (!it) return;
    setPalette(false);
    it.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm" onClick={() => setPalette(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl anim-in">
        <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-2.5">
          {paletteOpen === "files" ? <File size={14} className="text-slate-500" /> : <Terminal size={14} className="text-nv-400" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); exec(sel); }
              if (e.key === "Escape") setPalette(false);
            }}
            placeholder={paletteOpen === "files" ? "Go to file…" : "Run a command…"}
            className="flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-600"
          />
          <kbd className="rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-500">esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {!items.length && <div className="px-4 py-6 text-center text-[12px] text-slate-600">No matches</div>}
          {items.map((it, i) => (
            <button
              key={it.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => exec(i)}
              className={cn("flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left", i === sel ? "bg-nv-500/12" : "hover:bg-white/4")}
            >
              <span className={cn("text-[12.5px]", i === sel ? "text-nv-200" : "text-slate-300")}>{it.label}</span>
              {it.hint && <span className="truncate font-mono text-[10px] text-slate-600">{it.hint}</span>}
              {i === sel && <CornerDownLeft size={11} className="ml-auto shrink-0 text-nv-500/70" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
