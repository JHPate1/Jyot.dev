import { memo, useMemo, useState } from "react";
import { Check, Copy, FilePlus2 } from "lucide-react";

/**
 * ~3 KB markdown renderer. We avoid react-markdown + remark (≈180 KB) because
 * the transcript only ever needs headings, lists, tables-as-text, inline code,
 * bold/italic, links and fenced code. Everything is escaped by React itself —
 * no dangerouslySetInnerHTML anywhere.
 */

type Block =
  | { t: "code"; lang: string; body: string }
  | { t: "h"; level: number; body: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "quote"; body: string }
  | { t: "hr" }
  | { t: "p"; body: string };

function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w[\w+-]*)?/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push({ t: "code", lang, body: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: "h", level: h[1].length, body: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push({ t: "quote", body: body.join("\n") });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*+]\s+/, ""));
      out.push({ t: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push({ t: "ol", items });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```|^#{1,6}\s|^>\s?|^\s*[-*+]\s+|^\s*\d+[.)]\s+/.test(lines[i]))
      body.push(lines[i++]);
    out.push({ t: "p", body: body.join("\n") });
  }
  return out;
}

function Inline({ text }: { text: string }) {
  const parts = useMemo(() => {
    const tokens: { k: "t" | "c" | "b" | "i" | "a"; v: string; href?: string }[] = [];
    const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) tokens.push({ k: "t", v: text.slice(last, m.index) });
      const s = m[0];
      if (s.startsWith("`")) tokens.push({ k: "c", v: s.slice(1, -1) });
      else if (s.startsWith("**")) tokens.push({ k: "b", v: s.slice(2, -2) });
      else if (s.startsWith("[")) {
        const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(s)!;
        tokens.push({ k: "a", v: mm[1], href: mm[2] });
      } else tokens.push({ k: "i", v: s.slice(1, -1) });
      last = m.index + s.length;
    }
    if (last < text.length) tokens.push({ k: "t", v: text.slice(last) });
    return tokens;
  }, [text]);

  return (
    <>
      {parts.map((p, i) =>
        p.k === "c" ? (
          <code key={i} className="rounded bg-ink-700/70 px-1.5 py-0.5 font-mono text-[11.5px] text-nv-300">
            {p.v}
          </code>
        ) : p.k === "b" ? (
          <strong key={i} className="font-semibold text-slate-100">
            {p.v}
          </strong>
        ) : p.k === "i" ? (
          <em key={i}>{p.v}</em>
        ) : p.k === "a" ? (
          <a key={i} href={p.href} target="_blank" rel="noreferrer" className="text-sky-400 underline underline-offset-2">
            {p.v}
          </a>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      )}
    </>
  );
}

function CodeBlock({ lang, body, onInsert }: { lang: string; body: string; onInsert?: (b: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-white/8 bg-ink-950/80">
      <div className="flex items-center justify-between border-b border-white/6 bg-ink-850/60 px-3 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{lang || "text"}</span>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          {onInsert && (
            <button
              onClick={() => onInsert(body)}
              title="Stage into active file"
              className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/8 hover:text-nv-300"
            >
              <FilePlus2 size={12} />
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-white/8 hover:text-nv-300"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-slate-300">
        <code>{body}</code>
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ src, onInsert }: { src: string; onInsert?: (b: string) => void }) {
  const blocks = useMemo(() => parse(src), [src]);
  return (
    <div className="text-[13px] leading-relaxed text-slate-300">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "code":
            return <CodeBlock key={i} lang={b.lang} body={b.body} onInsert={onInsert} />;
          case "h":
            return (
              <div
                key={i}
                className={
                  b.level <= 2
                    ? "mt-3 mb-1.5 text-[13.5px] font-semibold text-slate-100"
                    : "mt-2.5 mb-1 text-[12.5px] font-semibold text-slate-200"
                }
              >
                <Inline text={b.body} />
              </div>
            );
          case "ul":
            return (
              <ul key={i} className="my-1.5 space-y-1 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-nv-500/70" />
                    <span>
                      <Inline text={it} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="my-1.5 space-y-1 pl-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="font-mono text-[11px] text-nv-500/80">{j + 1}.</span>
                    <span>
                      <Inline text={it} />
                    </span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="my-2 border-l-2 border-nv-500/50 pl-3 text-slate-400 italic">
                <Inline text={b.body} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="my-3 border-white/8" />;
          default:
            return (
              <p key={i} className="my-1.5 whitespace-pre-wrap">
                <Inline text={b.body} />
              </p>
            );
        }
      })}
    </div>
  );
});
