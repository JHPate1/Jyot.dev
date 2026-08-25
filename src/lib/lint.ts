/**
 * Ultra-light client-side "language intelligence".
 *
 * The full story (see the Blueprint tab) is LSP-in-a-Worker: `vscode-languageserver`
 * builds compiled to Wasm, talking JSON-RPC over postMessage. That is Phase 3 —
 * a TS server alone is ~12 MB and ~180 MB RSS. For the sub-500 MB budget we ship
 * this structural analyser instead: bracket balance, string termination, obvious
 * hazards. It costs ~1.5 KB and runs in <1 ms on a 1000-line file, and it is what
 * the agent's `run_check` tool calls against *staged* content before you accept.
 */
export interface Problem {
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);

const CODE_EXT = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "java", "c", "cpp", "go", "rs", "cs", "php"]);

export function lintSource(path: string, text: string): Problem[] {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const problems: Problem[] = [];
  if (text.length > 400_000) return problems;

  if (ext === "json") {
    try {
      JSON.parse(text);
    } catch (e: any) {
      problems.push({ line: 1, column: 1, severity: "error", message: `Invalid JSON: ${e.message}` });
    }
    return problems;
  }

  if (!CODE_EXT.has(ext)) return problems;

  const stack: { ch: string; line: number; col: number }[] = [];
  const lines = text.split("\n");
  let inBlockComment = false;

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "/" && next === "/") break;
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (PAIRS[ch]) stack.push({ ch, line: ln + 1, col: i + 1 });
      else if (CLOSERS.has(ch)) {
        const top = stack.pop();
        if (!top) problems.push({ line: ln + 1, column: i + 1, severity: "error", message: `Unmatched '${ch}'` });
        else if (PAIRS[top.ch] !== ch)
          problems.push({ line: ln + 1, column: i + 1, severity: "error", message: `Expected '${PAIRS[top.ch]}' to close '${top.ch}' from line ${top.line}, found '${ch}'` });
      }
    }
    if (quote && quote !== "`") problems.push({ line: ln + 1, column: line.length, severity: "error", message: "Unterminated string literal" });

    if (/\bdebugger\b/.test(line)) problems.push({ line: ln + 1, column: 1, severity: "warning", message: "`debugger` statement left in code" });
    if (/console\.log\(/.test(line) && !path.includes("test")) problems.push({ line: ln + 1, column: 1, severity: "info", message: "console.log left in source" });
    if (/\/\/\s*(TODO|FIXME|HACK)\b/i.test(line)) problems.push({ line: ln + 1, column: 1, severity: "info", message: line.trim().slice(0, 90) });
    if (/(?:^|[^=!<>])==(?!=)/.test(line) && (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx"))
      problems.push({ line: ln + 1, column: 1, severity: "warning", message: "Loose equality `==` — prefer `===`" });
  }

  for (const s of stack.slice(0, 5)) problems.push({ line: s.line, column: s.col, severity: "error", message: `Unclosed '${s.ch}'` });

  return problems.slice(0, 200);
}
