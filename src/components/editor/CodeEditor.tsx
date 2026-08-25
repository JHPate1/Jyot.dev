import { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
  dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  StreamLanguage,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap, search } from "@codemirror/search";
import { lintGutter, linter, type Diagnostic } from "@codemirror/lint";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { editorExtensionsBase } from "./theme";
import { lintSource } from "@/lib/lint";
import { extOf } from "@/lib/fs/types";

/**
 * CodeMirror 6 was chosen over Monaco deliberately:
 *   Monaco  ≈ 5.4 MB gz + a worker per language + ~180 MB RSS on a big file.
 *   CM6     ≈ 320 KB gz for this exact language set, ~35 MB RSS.
 * Languages are loaded through a Compartment so switching tabs never rebuilds
 * the whole state, and only the grammars actually used are retained.
 */

const simpleLang = (kws: string) =>
  StreamLanguage.define({
    token(stream) {
      if (stream.match(/^\s+/)) return null;
      if (stream.match(/^(#|\/\/).*/)) return "comment";
      if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return "string";
      if (stream.match(/^\d[\d._]*/)) return "number";
      const w = stream.match(/^[A-Za-z_][\w-]*/) as RegExpMatchArray | null;
      if (w && new RegExp(`^(${kws})$`).test(String(w[0]))) return "keyword";
      if (w) return null;
      stream.next();
      return null;
    },
  });

function languageFor(path: string): Extension {
  const e = extOf(path);
  switch (e) {
    case "ts":
    case "mts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "py":
      return python();
    case "html":
    case "htm":
    case "vue":
    case "svelte":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
    case "jsonc":
    case "lock":
      return json();
    case "md":
    case "mdx":
      return markdown();
    case "rs":
      return rust();
    case "yml":
    case "yaml":
      return simpleLang("true|false|null|yes|no|on|off");
    case "sh":
    case "bash":
    case "zsh":
      return simpleLang("if|then|fi|else|elif|for|while|do|done|case|esac|function|return|export|local|echo|cd|set");
    case "go":
      return simpleLang("func|package|import|var|const|type|struct|interface|go|defer|chan|select|range|map|return|if|else|for|switch|case");
    case "sql":
      return simpleLang("select|from|where|insert|update|delete|join|left|right|inner|group|order|by|limit|create|table|alter|drop|index|values|set|and|or|not|null");
    default:
      return [];
  }
}

interface Props {
  path: string;
  value: string;
  extVersion: number;
  onChange: (v: string) => void;
  onSelection: (s: string) => void;
  onSave: () => void;
  onInlineEdit: () => void;
  onPalette: () => void;
}

export default function CodeEditor({ path, value, extVersion, onChange, onSelection, onSave, onInlineEdit, onPalette }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const cbs = useRef({ onChange, onSelection, onSave, onInlineEdit, onPalette });
  cbs.current = { onChange, onSelection, onSave, onInlineEdit, onPalette };
  const lastPath = useRef(path);
  const lastExt = useRef(extVersion);

  useEffect(() => {
    if (!host.current) return;
    const lintExt = linter((v) => {
      const diags: Diagnostic[] = [];
      const doc = v.state.doc;
      for (const p of lintSource(lastPath.current, doc.toString())) {
        if (p.line > doc.lines) continue;
        const line = doc.line(p.line);
        diags.push({
          from: Math.min(line.from + Math.max(0, p.column - 1), line.to),
          to: line.to,
          severity: p.severity,
          message: p.message,
        });
      }
      return diags;
    }, { delay: 700 });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter({ markerDOM: (open) => {
          const s = document.createElement("span");
          s.textContent = open ? "▾" : "▸";
          s.style.cssText = "color:#4b5865;font-size:10px;cursor:pointer";
          return s;
        } }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of("  "),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true, maxRenderedOptions: 12 }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        lintGutter(),
        lintExt,
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              cbs.current.onSave();
              return true;
            },
          },
          {
            key: "Mod-k",
            preventDefault: true,
            run: () => {
              cbs.current.onInlineEdit();
              return true;
            },
          },
          {
            key: "Mod-p",
            preventDefault: true,
            run: () => {
              cbs.current.onPalette();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langComp.current.of(languageFor(path)),
        ...editorExtensionsBase,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbs.current.onChange(u.state.doc.toString());
          if (u.selectionSet) {
            const r = u.state.selection.main;
            cbs.current.onSelection(r.empty ? "" : u.state.sliceDoc(r.from, r.to));
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // swap document when the active tab or an external write changes
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const pathChanged = lastPath.current !== path;
    const extChanged = lastExt.current !== extVersion;
    lastPath.current = path;
    lastExt.current = extVersion;
    if (!pathChanged && !extChanged) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      effects: pathChanged ? langComp.current.reconfigure(languageFor(path)) : undefined,
      selection: { anchor: 0 },
      scrollIntoView: true,
    });
  }, [path, extVersion, value]);

  // keep the doc in sync if the buffer was mutated elsewhere while mounted
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() !== value && lastPath.current === path) {
      const sel = v.state.selection.main.head;
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
        selection: { anchor: Math.min(sel, value.length) },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <div ref={host} className="h-full w-full overflow-hidden" />;
}
