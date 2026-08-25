import { memo, useState } from "react";
import { ChevronRight, FilePlus, FolderPlus, MoreHorizontal, RefreshCw, Trash2, PenLine } from "lucide-react";
import { useIde } from "@/store/ide";
import type { VNode } from "@/lib/fs/types";
import { extOf } from "@/lib/fs/types";
import { cn } from "@/utils/cn";

const COLORS: Record<string, string> = {
  ts: "text-sky-400", tsx: "text-sky-300", js: "text-yellow-400", jsx: "text-yellow-300",
  json: "text-amber-400", md: "text-slate-400", css: "text-blue-400", html: "text-orange-400", py: "text-emerald-400",
};

function FileGlyph({ path }: { path: string }) {
  const e = extOf(path);
  const label = e.length > 3 ? e.slice(0, 3) : e;
  return <span className={cn("w-[26px] shrink-0 text-right font-mono text-[9px] font-semibold", COLORS[e] ?? "text-slate-500")}>{label}</span>;
}

const Row = memo(function Row({ node, depth }: { node: VNode; depth: number }) {
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
      <div className={cn("group relative flex h-[26px] cursor-pointer items-center gap-1.5 pr-1 text-[13px] transition-colors", active ? "bg-white text-black" : "text-slate-400 hover:bg-white/5 hover:text-white")} style={{ paddingLeft: depth * 12 + 8 }} onClick={() => (isDir ? toggleDir(node.path) : openFile(node.path))} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}>
        {isDir ? <ChevronRight size={13} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-90")} /> : <FileGlyph path={node.path} />}
        <span className={cn("truncate", isDir && "font-medium")}>{node.name}</span>
        {dirty && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
        {staged && <span className="ml-auto shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">•</span>}
        <button onClick={(e) => { e.stopPropagation(); setMenu(true); }} className="ml-auto hidden shrink-0 rounded p-0.5 text-slate-500 hover:text-white group-hover:block"><MoreHorizontal size={12} /></button>
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
  const act = async (fn: () => Promise<void> | void) => { onClose(); await fn(); };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="relative z-50 mx-2 my-1 overflow-hidden rounded-xl border border-white/10 bg-[#1d2026] py-1 text-[12.5px] shadow-2xl anim-in">
        {[
          { icon: FilePlus, label: "New file…", run: () => { const n = prompt("File name:", dir ? `${dir}/untitled.ts` : "untitled.ts"); if (n) return createEntry(n, "file"); } },
          { icon: FolderPlus, label: "New folder…", run: () => { const n = prompt("Folder name:", dir ? `${dir}/new-folder` : "new-folder"); if (n) return createEntry(n, "directory"); } },
          { icon: PenLine, label: "Rename…", run: () => { const n = prompt("Rename to:", node.path); if (n && n !== node.path) return renamePath(node.path, n); } },
          { icon: Trash2, label: "Delete", danger: true, run: () => { if (confirm(`Delete ${node.path}?`)) return deletePath(node.path); } },
        ].map((it) => (
          <button key={it.label} onClick={() => act(it.run as any)} className={cn("flex w-full items-center gap-2 px-3.5 py-2 text-left hover:bg-white/5", (it as any).danger ? "text-red-400" : "text-slate-200")}><it.icon size={13} /> {it.label}</button>
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
    <div className="flex h-full flex-col bg-[#121418]">
      <div className="flex items-center gap-1.5 border-b border-white/6 px-3 py-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find files…" className="min-w-0 flex-1 rounded-full bg-[#17191e] px-3 py-1.5 text-[12px] text-white outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-white/10" />
        <button title="New file" onClick={() => { const n = prompt("File name:", "src/new-file.ts"); if (n) createEntry(n, "file"); }} className="rounded-full bg-white/5 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><FilePlus size={14} /></button>
        <button title="Refresh" onClick={() => refreshTree(true)} className="rounded-full bg-white/5 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><RefreshCw size={14} className={cn(indexing && "animate-spin")} /></button>
      </div>
      {indexing && <div className="h-[2px] w-full bg-[#1d2026]"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round(indexProgress * 100)}%` }} /></div>}
      <div className="flex-1 overflow-y-auto py-1.5">{view?.children?.map((c) => <Row key={c.path} node={c} depth={0} />)}{!view?.children?.length && <div className="px-3 py-8 text-center text-[12px] text-slate-500">No files found</div>}</div>
    </div>
  );
}
