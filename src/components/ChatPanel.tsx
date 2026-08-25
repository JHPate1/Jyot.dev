import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, AtSign, ChevronDown, CircleStop, Eraser, FileCode2, Hammer,
  MessageSquare, Search, Terminal, User, Wand2, Zap,
} from "lucide-react";
import { useIde } from "@/store/ide";
import { Markdown } from "./Markdown";
import { cn } from "@/utils/cn";
import { flattenFiles } from "@/lib/fs/types";
import type { ToolResult } from "@/lib/ai/tools";

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
  finish: Terminal,
};

const TOOL_TITLE: Record<string, string> = {
  read_file: "Read file",
  list_dir: "Listed folder",
  search_workspace: "Searched project",
  create_file: "Prepared new file",
  write_file: "Prepared file update",
  edit_file: "Prepared code change",
  delete_file: "Prepared file removal",
  diff_preview: "Checked pending changes",
  run_check: "Checked code syntax",
  finish: "Completed task",
};

function ToolCard({ t }: { t: { call: any; result?: ToolResult } }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[t.call.tool] ?? Hammer;
  const running = !t.result;
  const failed = t.result && !t.result.ok;
  const arg = t.call.args?.path ?? t.call.args?.query ?? t.call.args?.summary ?? "";
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-ink-850/80", failed ? "border-red-500/30" : "border-white/8")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/4">
        <Icon size={12} className={cn(running ? "text-nv-400" : failed ? "text-red-400" : "text-slate-400")} />
        <span className="text-[11.5px] font-medium text-slate-200">{TOOL_TITLE[t.call.tool] || t.call.tool}</span>
        <span className="truncate font-mono text-[11px] text-slate-400">{String(arg).slice(0, 48)}</span>
        {running && (
          <span className="ml-auto text-[10.5px] text-slate-400">working...</span>
        )}
        {t.result && (
          <ChevronDown size={12} className={cn("ml-auto shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && t.result && (
        <pre className="max-h-56 overflow-auto border-t border-white/6 bg-ink-950/70 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
          {t.result.output.slice(0, 4000)}
        </pre>
      )}
    </div>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, open]);
  if (!text) return null;
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-white/8 bg-ink-850/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-1.5 hover:bg-white/4">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span className="text-[11.5px] text-slate-300">{live ? "Thinking about your request..." : "Show assistant thought steps"}</span>
        <ChevronDown size={12} className={cn("ml-auto text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre ref={ref} className="max-h-64 overflow-auto border-t border-white/6 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">
          {text}
        </pre>
      )}
    </div>
  );
}

const QUICK = [
  { label: "Explain this file", text: "Explain what the currently open file does in clear, simple terms and point out key line numbers." },
  { label: "Check for bugs", text: "Review the files in this project for any bugs, calculation errors, or problems that might break." },
  { label: "Add unit tests", text: "Write simple unit tests for the currently open file." },
  { label: "Clean up code", text: "Clean up and simplify the open file so it is easier to read." },
];

export default function ChatPanel() {
  const {
    chat, running, send, stop, agentMode, setAgentMode, clearChat, step, settings,
    tree, activeTab, staging, stagingVersion, setPanel, buffers,
  } = useIde();
  const [text, setText] = useState("");
  const [ctxPaths, setCtxPaths] = useState<string[]>([]);
  const [mention, setMention] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  void stagingVersion;

  const files = useMemo(() => (tree ? flattenFiles(tree).map((f) => f.path) : []), [tree]);
  const mentionQuery = useMemo(() => {
    const m = /@([\w./-]*)$/.exec(text);
    return m ? m[1] : null;
  }, [text]);
  const suggestions = useMemo(
    () => (mentionQuery === null ? [] : files.filter((f) => f.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 7)),
    [mentionQuery, files],
  );

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  useEffect(() => {
    setMention(mentionQuery !== null && suggestions.length > 0);
  }, [mentionQuery, suggestions.length]);

  const submit = () => {
    const v = text.trim();
    if (!v || running) return;
    setText("");
    setCtxPaths([]);
    send(v, ctxPaths);
  };

  const addMention = (p: string) => {
    setText((t) => t.replace(/@([\w./-]*)$/, `@${p} `));
    setCtxPaths((c) => (c.includes(p) ? c : [...c, p]));
    ta.current?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/6 px-3 py-2">
        <div className="flex rounded-lg border border-white/8 bg-ink-800 p-0.5">
          {(["agent", "chat"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setAgentMode(m === "agent")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition",
                (m === "agent") === agentMode ? "bg-nv-500/20 text-nv-300" : "text-slate-400 hover:text-slate-200",
              )}
            >
              {m === "agent" ? <Wand2 size={12} /> : <MessageSquare size={12} />}
              {m === "agent" ? "Make Changes" : "Ask Questions"}
            </button>
          ))}
        </div>
        <span className="truncate text-[11px] text-slate-400">{settings.model.split("/").pop()}</span>
        {running && (
          <span className="rounded bg-nv-500/15 px-2 py-0.5 text-[10.5px] font-medium text-nv-300">Step {step}</span>
        )}
        <button onClick={clearChat} title="Clear chat history" className="ml-auto rounded p-1 text-slate-400 hover:bg-white/6 hover:text-slate-200">
          <Eraser size={14} />
        </button>
      </div>

      {/* transcript */}
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {!chat.length && (
          <div className="pt-6 text-center">
            <div className="text-[14px] font-semibold text-slate-100">Coding Assistant</div>
            <p className="mx-auto mt-1 max-w-[290px] text-[12px] leading-relaxed text-slate-400">
              Ask anything about your code or ask for changes. Proposed edits appear in the Review Changes tab so you stay in full control.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setText(q.text)}
                  className="rounded-lg border border-white/8 bg-ink-800/80 px-2.5 py-1.5 text-[11.5px] text-slate-300 transition hover:border-white/20 hover:text-white"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.map((t) => (
          <div key={t.id} className="anim-in">
            {t.role === "user" ? (
              <div className="flex gap-2.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-ink-700 text-slate-300">
                  <User size={11} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="rounded-lg border border-white/8 bg-ink-800/80 px-3.5 py-2.5 text-[13px] whitespace-pre-wrap text-slate-100">
                    {t.content}
                  </div>
                  {!!t.contextPaths?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.contextPaths.map((p) => (
                        <span key={p} className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">@{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", t.error ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/10 bg-ink-800 text-nv-300")}>
                  <Wand2 size={11} />
                </div>
                <div className="min-w-0 flex-1">
                  <Reasoning text={t.reasoning ?? ""} live={!!t.streaming && !t.content} />
                  {!!t.tools?.length && (
                    <div className="mb-2 space-y-1.5">
                      {t.tools.map((x, i) => <ToolCard key={i} t={x} />)}
                    </div>
                  )}
                  {t.content ? (
                    <Markdown src={stripToolFences(t.content)} />
                  ) : t.streaming && !t.reasoning ? (
                    <div className="h-3 w-24 rounded shimmer" />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ))}

        {!!staging.size && (
          <button
            onClick={() => setPanel("diff")}
            className="flex w-full items-center gap-2 rounded-lg border border-nv-500/40 bg-nv-500/15 px-3.5 py-2.5 text-left transition hover:bg-nv-500/20"
          >
            <Wand2 size={14} className="text-nv-400" />
            <span className="text-[12.5px] font-medium text-slate-100">{staging.size} file change{staging.size > 1 ? "s" : ""} ready for review</span>
            <span className="ml-auto text-[11.5px] font-medium text-nv-300">Review Changes →</span>
          </button>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-white/6 p-2">
        {!!ctxPaths.length && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {ctxPaths.map((p) => (
              <button
                key={p}
                onClick={() => setCtxPaths((c) => c.filter((x) => x !== p))}
                className="group rounded border border-nv-500/25 bg-nv-500/10 px-1.5 py-0.5 font-mono text-[10px] text-nv-300"
              >
                @{p.split("/").pop()} <span className="text-slate-400 group-hover:text-red-400">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="relative rounded-xl border border-white/10 bg-ink-850 focus-within:border-white/25">
          {mention && (
            <div className="absolute bottom-full left-0 mb-1 w-full overflow-hidden rounded-lg border border-white/10 bg-ink-800 shadow-2xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => addMention(s)}
                  className="block w-full truncate px-3 py-1.5 text-left font-mono text-[11.5px] text-slate-300 hover:bg-white/6 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={ta}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") setMention(false);
            }}
            rows={2}
            placeholder={activeTab ? `Ask about ${activeTab.split("/").pop()} — type @ to mention a file` : "Ask a question or request a code change — type @ to mention a file"}
            className="max-h-40 w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2">
            <button onClick={() => { setText((t) => t + "@"); ta.current?.focus(); }} className="rounded p-1 text-slate-400 hover:bg-white/6 hover:text-slate-200" title="Attach file">
              <AtSign size={14} />
            </button>
            <span className="text-[11px] text-slate-400">
              {buffers[activeTab ?? ""]?.dirty ? "Unsaved edits included" : "Current file included"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {running ? (
                <button onClick={stop} className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-300 hover:bg-red-500/25">
                  <CircleStop size={14} /> Stop
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!text.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-nv-500 px-3 py-1 text-[12px] font-medium text-white transition disabled:opacity-30 enabled:hover:bg-nv-400"
                >
                  <ArrowUp size={14} /> Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function stripToolFences(s: string) {
  return s.replace(/```(?:tool|tool_call|json:tool)\s*\n[\s\S]*?```/g, "").trim();
}
