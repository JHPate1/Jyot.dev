import { memo, useState } from "react";
import { ChevronRight, FilePlus, FolderPlus, MoreHorizontal, RefreshCw, Trash2, PenLine } from "lucide-react";
import { useIde } from "@/store/ide";
import type { VNode } from "@/lib/fs/types";
import { extOf } from "@/lib/fs/types";
import { cn } from "@/utils/cn";

const COLORS: Record<string, string> = {
  ts: "text-sky-400", tsx: "text-sky-300", js: "text-yellow-400", jsx: "text-yellow-300",
  json: "text-amber-400", md: "text-slate-400", css: "text-blue-400", scss: "text-pink-400",
  html: "text-orange-400", py: "text-emerald-400", rs: "text-orange-300", go: "text-cyan-300",
  yml: "text-purple-300", yaml: "text-purple-300", svg: "text-fuchsia-300", sh: "text-lime-300",
};

function FileGlyph({ path }: { path: string }) {
  const e = extOf(path);
  const label = e.length > 3 ? e.slice(0, 3) : e;
  return (
    <span className={cn("w-[26px] shrink-0 text-right font-mono text-[9px] font-semibold tracking-tight", COLORS[e] ?? "text-slate-500")}>
      {label}
    </span>
  );
}

const Row = memo(function Row({ node, depth }: { node: VNode; depth: number }) {
  // narrow selectors: a keystroke in the editor must not re-render 500 rows
  const open = useIde((s) => !!s.expanded[node.path]);
  const active = useIde((s) => s.activeTab === node.path);
  const dirty = useIde((s) => !!s.buffers[node.path]?.dirty);
  const staged = useIde((s) => s.stagingVersion >= 0 && s.staging.has(node.path));
  const toggleDir = useIde((s) => s.toggleDir);
  const openFile = useIde((s) => s.openFile);
  const [menu, setMenu] = useState(false);
  const isDir = node.kind === "directory";

  return (
    <>
      <div
        className={cn(
          "group relative flex h-[24px] cursor-pointer items-center gap-1.5 pr-1 text-[12.5px] transition-colors",
          active ? "bg-nv-500/12 text-slate-100" : "text-slate-400 hover:bg-white/4 hover:text-slate-200",
        )}
        style={{ paddingLeft: depth * 11 + 6 }}
        onClick={() => (isDir ? toggleDir(node.path) : openFile(node.path))}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu(true);
        }}
      >
        {active && <span className="absolute left-0 top-0 h-full w-[2px] bg-nv-500" />}
        {isDir ? (
          <ChevronRight size={13} className={cn("shrink-0 text-slate-600 transition-transform", open && "rotate-90")} />
        ) : (
          <FileGlyph path={node.path} />
        )}
        <span className={cn("truncate", isDir && "font-medium text-slate-300")}>{node.name}</span>
        {dirty && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
        {staged && <span className="ml-auto shrink-0 rounded bg-nv-500/20 px-1 font-mono text-[9px] text-nv-300">±</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenu(true);
          }}
          className="ml-auto hidden shrink-0 rounded p-0.5 text-slate-500 hover:text-slate-200 group-hover:block"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
      {menu && <NodeMenu node={node} onClose={() => setMenu(false)} />}
      {isDir && open && node.children?.map((c) => <Row key={c.path} node={c} depth={depth + 1} />)}
    </>
  );
});

function NodeMenu({ node, onClose }: { node: VNode; onClose: () => void }) {
  const createEntry = useIde((s) => s.createEntry);
  const deletePath = useIde((s) => s.deletePath);
  const renamePath = useIde((s) => s.renamePath);
  const dir = node.kind === "directory" ? node.path : node.path.split("/").slice(0, -1).join("/");
  const act = async (fn: () => Promise<void> | void) => {
    onClose();
    await fn();
  };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="relative z-50 mx-2 my-1 overflow-hidden rounded-lg border border-white/10 bg-ink-800 py-1 text-[12px] shadow-2xl anim-in">
        {[
          { icon: FilePlus, label: "New file…", run: () => { const n = prompt("New file path:", dir ? `${dir}/untitled.ts` : "untitled.ts"); if (n) return createEntry(n, "file"); } },
          { icon: FolderPlus, label: "New folder…", run: () => { const n = prompt("New folder path:", dir ? `${dir}/new-folder` : "new-folder"); if (n) return createEntry(n, "directory"); } },
          { icon: PenLine, label: "Rename…", run: () => { const n = prompt("Rename to:", node.path); if (n && n !== node.path) return renamePath(node.path, n); } },
          { icon: Trash2, label: "Delete", danger: true, run: () => { if (confirm(`Delete ${node.path}?`)) return deletePath(node.path); } },
        ].map((it) => (
          <button
            key={it.label}
            onClick={() => act(it.run as any)}
            className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/6", (it as any).danger ? "text-red-400" : "text-slate-300")}
          >
            <it.icon size={12} /> {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

export default function FileTree() {
  const tree = useIde((s) => s.tree);
  const refreshTree = useIde((s) => s.refreshTree);
  const createEntry = useIde((s) => s.createEntry);
  const indexing = useIde((s) => s.indexing);
  const indexProgress = useIde((s) => s.indexProgress);
  const [filter, setFilter] = useState("");

  const filtered = (n: VNode): VNode | null => {
    if (!filter) return n;
    if (n.kind === "file") return n.name.toLowerCase().includes(filter.toLowerCase()) ? n : null;
    const kids = (n.children ?? []).map(filtered).filter(Boolean) as VNode[];
    return kids.length ? { ...n, children: kids } : null;
  };
  const view = tree ? filtered(tree) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-white/6 px-2 py-1.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files…"
          className="min-w-0 flex-1 rounded bg-ink-800/80 px-2 py-1 text-[11.5px] text-slate-300 outline-none ring-nv-500/40 placeholder:text-slate-600 focus:ring-1"
        />
        <button title="New file" onClick={() => { const n = prompt("New file path:", "src/new-file.ts"); if (n) createEntry(n, "file"); }} className="rounded p-1 text-slate-500 hover:bg-white/6 hover:text-slate-200">
          <FilePlus size={13} />
        </button>
        <button title="Refresh + reindex" onClick={() => refreshTree(true)} className="rounded p-1 text-slate-500 hover:bg-white/6 hover:text-slate-200">
          <RefreshCw size={13} className={cn(indexing && "animate-spin text-nv-400")} />
        </button>
      </div>
      {indexing && (
        <div className="h-[2px] w-full bg-ink-800">
          <div className="h-full bg-nv-500 transition-all" style={{ width: `${Math.round(indexProgress * 100)}%` }} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto py-1">
        {view?.children?.map((c) => <Row key={c.path} node={c} depth={0} />)}
        {!view?.children?.length && <div className="px-3 py-6 text-center text-[11.5px] text-slate-600">No files</div>}
      </div>
    </div>
  );
}
