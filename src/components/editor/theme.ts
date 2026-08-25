import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Dark syntax theme tuned for high contrast and calm readability. */
export const kodeHighlight = HighlightStyle.define([
  { tag: [t.comment, t.blockComment, t.lineComment], color: "#64748b", fontStyle: "italic" },
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: "#c084fc" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "#86efac" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#fb923c" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: "#60a5fa" },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: "#f1f5f9" },
  { tag: [t.variableName, t.propertyName], color: "#cbd5e1" },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: "#fde047" },
  { tag: [t.operator, t.operatorKeyword, t.punctuation, t.separator], color: "#94a3b8" },
  { tag: [t.bracket, t.paren, t.squareBracket, t.brace], color: "#94a3b8" },
  { tag: [t.tagName], color: "#f87171" },
  { tag: [t.attributeName], color: "#fde047" },
  { tag: [t.heading], color: "#60a5fa", fontWeight: "600" },
  { tag: [t.link, t.url], color: "#60a5fa", textDecoration: "underline" },
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "600" },
  { tag: [t.invalid], color: "#f43f5e" },
  { tag: [t.meta, t.processingInstruction], color: "#64748b" },
]);

export const kodeTheme = EditorView.theme(
  {
    "&": { color: "#e2e8f0", backgroundColor: "transparent", height: "100%" },
    ".cm-content": { caretColor: "#60a5fa", padding: "10px 0" },
    ".cm-line": { padding: "0 16px 0 10px" },
    ".cm-matchingBracket": {
      backgroundColor: "rgba(59, 130, 246, 0.22) !important",
      outline: "1px solid rgba(96, 165, 250, 0.45)",
      borderRadius: "2px",
    },
    ".cm-foldPlaceholder": {
      background: "rgba(255, 255, 255, 0.06)",
      border: "none",
      color: "#94a3b8",
      padding: "0 6px",
      borderRadius: "4px",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 16px", minWidth: "42px" },
  },
  { dark: true },
);

export const editorExtensionsBase = [kodeTheme, syntaxHighlighting(kodeHighlight)];
