import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, AtSign, ChevronDown, CircleStop, Eraser, FileCode2, Hammer,
  MessageSquare, Search, Wand2, Zap,
} from "lucide-react";
import { useIde } from "@/store/ide";
import { Markdown } from "./Markdown";
import { cn } from "@/utils/cn";
import { flattenFiles } from "@/lib/fs/types";
import { parseToolCalls, type ToolResult } from "@/lib/ai/tools";

const TOOL_ICON: Record<string, any> = {
  read_file: FileCode2,
  list_dir: FileCode2,
  search_workspace: Search,
  create_file: Hammer,
  write_file: Hammer,
  edit_file: Wand2,
  delete_file: Hammer,
  diff_preview: Search,
  run_check: Zap,
  finish: MessageSquare,
};

const TOOL_TITLE: Record<string, string> = {
  read_file: "Opened file",
  list_dir: "Browsed folder",
  search_workspace: "Searched project",
  create_file: "Prepared new file",
  write_file: "Prepared file update",
  edit_file: "Prepared code change",
  delete_file: "Prepared file removal",
  diff_preview: "Checked pending changes",
  run_check: "Checked code",
  finish: "Finished",
};

function ToolCard({ t }: { t: { call: any; result?: ToolResult } }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[t.call.tool] ?? Hammer;
  const running = !t.result;
  const failed = t.result && !t.result.ok;
  const arg = t.call.args?.path ?? t.call.args?.query ?? t.call.args?.summary ?? "";
  return (
    <div className={cn("overflow-hidden rounded-xl border", failed ? "border-red-500/30 bg-[#1a1515]" : "border-white/8 bg-[#17191e]")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03]">
        <Icon size={13} className={cn(running ? "text-indigo-400" : failed ? "text-red-400" : "text-slate-400")} />
        <span className="text-[12px] font-medium text-slate-200">{TOOL_TITLE[t.call.tool] || t.call.tool}</span>
        <span className="truncate font-mono text-[11px] text-slate-500">{String(arg).slice(0, 48)}</span>
        {running && <span className="ml-auto text-[11px] text-slate-400">working…</span>}
        {t.result && <ChevronDown size={13} className={cn("ml-auto shrink-0 text-slate-500 transition-transform", open && "rotate-180")} />}
      </button>
      {open && t.result && (
        <pre className="max-h-56 overflow-auto border-t border-white/6 bg-[#0f1014] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
          {t.result.output.slice(0, 4000)}
        </pre>
      )}
    </div>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [text, open]);
  if (!text) return null;
  return (
    <div className="mb-2.5 overflow-hidden rounded-xl border border-white/8 bg-[#17191e]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/[0.03]">
        <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-indigo-400 animate-pulse" : "bg-slate-500")} />
        <span className="text-[12px] text-slate-300">{live ? "Seeker Pro 1.2 is thinking…" : "Show thinking steps"}</span>
        <ChevronDown size={13} className={cn("ml-auto text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre ref={ref} className="max-h-64 overflow-auto border-t border-white/6 px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
          {text}
        </pre>
      )}
    </div>
  );
}

const QUICK = [
  { label: "Explain this file", text: "Explain what the open file does in simple terms, with file and line references." },
  { label: "Check for bugs", text: "Look through the project for bugs or things that might break and explain them simply." },
  { label: "Add tests", text: "Write simple tests for the open file." },
  { label: "Clean up code", text: "Clean up the open file to make it easier to read." },
];

export default function ChatPanel() {
  const {
    chat, running, send, stop, agentMode, setAgentMode, clearChat, step,
    tree, activeTab, staging, stagingVersion, setPanel, buffers,
  } = useIde();
  const [text, setText] = useState("");
  const [ctxPaths, setCtxPaths] = useState<string[]>([]);
  const [mention, setMention] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  void stagingVersion;

  const files = useMemo(() => (tree ? flattenFiles(tree).map((f) => f.path) : []), [tree]);
  const mentionQuery = useMemo(() => { const m = /@([\w./-]*)$/.exec(text); return m ? m[1] : null; }, [text]);
  const suggestions = useMemo(() => (mentionQuery === null ? [] : files.filter((f) => f.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 7)), [mentionQuery, files]);

  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [chat]);
  useEffect(() => { setMention(mentionQuery !== null && suggestions.length > 0); }, [mentionQuery, suggestions.length]);

  const submit = () => {
    const v = text.trim();
    if (!v || running) return;
    setText(""); setCtxPaths([]); send(v, ctxPaths);
  };
  const addMention = (p: string) => {
    setText((t) => t.replace(/@([\w./-]*)$/, `@${p} `));
    setCtxPaths((c) => (c.includes(p) ? c : [...c, p]));
    ta.current?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2.5">
        <div className="flex rounded-full border border-white/8 bg-[#1d2026] p-0.5">
          {(["agent", "chat"] as const).map((m) => (
            <button key={m} onClick={() => setAgentMode(m === "agent")} className={cn("rounded-full px-3 py-1 text-[12px] font-medium transition", (m === "agent") === agentMode ? "bg-white text-black" : "text-slate-400 hover:text-slate-200")}>
              {m === "agent" ? "Make Changes" : "Ask Questions"}
            </button>
          ))}
        </div>
        <span className="ml-1 text-[11px] text-slate-500">Seeker Pro 1.2</span>
        {running && <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10.5px] font-medium text-indigo-300">Step {step}</span>}
        <button onClick={clearChat} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/6 hover:text-white"><Eraser size={14} /></button>
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {!chat.length && (
          <div className="pt-8 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">S</div>
            <div className="text-[14px] font-semibold text-white">Ask Seeker Pro 1.2</div>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-slate-400">Ask about your code or request edits. All changes are shown for review before saving.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {QUICK.map((q) => (
                <button key={q.label} onClick={() => setText(q.text)} className="rounded-full border border-white/10 bg-[#1d2026] px-3 py-1.5 text-[11.5px] text-slate-300 hover:bg-white/10 hover:text-white">{q.label}</button>
              ))}
            </div>
          </div>
        )}

        {chat.map((t) => (
          <div key={t.id} className="anim-in">
            {t.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-[13.5px] text-black">{t.content}</div>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", t.error ? "bg-red-500" : "bg-indigo-600")}>S</div>
                <div className="min-w-0 flex-1">
                  <Reasoning text={t.reasoning ?? ""} live={!!t.streaming && !stripToolFences(t.content)} />
                  {!!t.tools?.length && <div className="mb-2.5 space-y-1.5">{t.tools.map((x, i) => <ToolCard key={i} t={x} />)}</div>}
                  {(() => {
                    const visible = stripToolFences(t.content);
                    if (visible) return <Markdown src={visible} />;
                    if (t.streaming) return <div className="rounded-xl border border-white/8 bg-[#17191e] px-3 py-2.5 text-[12px] text-slate-400">Seeker Pro 1.2 is working on the next step…</div>;
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>
        ))}

        {!!staging.size && (
          <button onClick={() => setPanel("diff")} className="flex w-full items-center gap-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-left hover:bg-indigo-500/15">
            <Wand2 size={16} className="text-indigo-400" />
            <span className="text-[13px] font-medium text-white">{staging.size} change{staging.size > 1 ? "s" : ""} ready</span>
            <span className="ml-auto text-[12px] font-medium text-indigo-300">Review →</span>
          </button>
        )}
      </div>

      <div className="border-t border-white/6 p-3">
        {!!ctxPaths.length && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ctxPaths.map((p) => (
              <button key={p} onClick={() => setCtxPaths((c) => c.filter((x) => x !== p))} className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2.5 py-1 font-mono text-[10.5px] text-indigo-300">@{p.split("/").pop()} ×</button>
            ))}
          </div>
        )}
        <div className="relative rounded-2xl border border-white/10 bg-[#1d2026] focus-within:border-white/20">
          {mention && (
            <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#1d2026] shadow-2xl">
              {suggestions.map((s) => (
                <button key={s} onClick={() => addMention(s)} className="block w-full truncate px-3 py-2 text-left font-mono text-[12px] text-slate-300 hover:bg-white/5 hover:text-white">{s}</button>
              ))}
            </div>
          )}
          <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setMention(false); }} rows={2} placeholder={activeTab ? `Ask about ${activeTab.split("/").pop()}` : "Ask or request changes — @ to mention a file"} className="max-h-40 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[13.5px] text-white outline-none placeholder:text-slate-500" />
          <div className="flex items-center gap-2 px-3 pb-3">
            <button onClick={() => { setText((t) => t + "@"); ta.current?.focus(); }} className="rounded-full bg-white/5 p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><AtSign size={14} /></button>
            <span className="text-[11px] text-slate-500">{buffers[activeTab ?? ""]?.dirty ? "Unsaved edits included" : "Current file included"}</span>
            <div className="ml-auto">
              {running ? <button onClick={stop} className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3.5 py-1.5 text-[12.5px] font-medium text-red-300 hover:bg-red-500/25"><CircleStop size={14} /> Stop</button> : <button onClick={submit} disabled={!text.trim()} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black disabled:opacity-30 hover:bg-slate-100"><ArrowUp size={14} /> Send</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function stripToolFences(s: string) {
  return parseToolCalls(s).prose;
}
