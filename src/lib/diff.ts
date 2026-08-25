/**
 * Dependency-free line diff (Hunt–Szymanski style LCS over hashed lines with a
 * common prefix/suffix trim). ~2 KB, O(n·m) worst case but the trim makes real
 * edits effectively linear. Produces git-like hunks for the staging UI.
 */

export type DiffOp = "eq" | "add" | "del";

export interface DiffLine {
  op: DiffOp;
  text: string;
  aLine?: number;
  bLine?: number;
}

export interface Hunk {
  id: string;
  aStart: number;
  bStart: number;
  lines: DiffLine[];
  added: number;
  removed: number;
}

function lcsMatrix(a: string[], b: string[]): Uint32Array {
  const w = b.length + 1;
  const m = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      m[i * w + j] =
        a[i] === b[j] ? m[(i + 1) * w + j + 1] + 1 : Math.max(m[(i + 1) * w + j], m[i * w + j + 1]);
    }
  }
  return m;
}

export function diffLines(aText: string, bText: string): DiffLine[] {
  const a = aText.length ? aText.split("\n") : [];
  const b = bText.length ? bText.split("\n") : [];

  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const aMid = a.slice(pre, a.length - suf);
  const bMid = b.slice(pre, b.length - suf);

  const out: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  for (let i = 0; i < pre; i++) out.push({ op: "eq", text: a[i], aLine: ++ai, bLine: ++bi });

  // guard against pathological files
  if (aMid.length * bMid.length > 4_000_000) {
    aMid.forEach((t) => out.push({ op: "del", text: t, aLine: ++ai }));
    bMid.forEach((t) => out.push({ op: "add", text: t, bLine: ++bi }));
  } else {
    const w = bMid.length + 1;
    const m = lcsMatrix(aMid, bMid);
    let i = 0;
    let j = 0;
    while (i < aMid.length && j < bMid.length) {
      if (aMid[i] === bMid[j]) {
        out.push({ op: "eq", text: aMid[i], aLine: ++ai, bLine: ++bi });
        i++;
        j++;
      } else if (m[(i + 1) * w + j] >= m[i * w + j + 1]) {
        out.push({ op: "del", text: aMid[i], aLine: ++ai });
        i++;
      } else {
        out.push({ op: "add", text: bMid[j], bLine: ++bi });
        j++;
      }
    }
    while (i < aMid.length) out.push({ op: "del", text: aMid[i++], aLine: ++ai });
    while (j < bMid.length) out.push({ op: "add", text: bMid[j++], bLine: ++bi });
  }

  for (let i = a.length - suf; i < a.length; i++) out.push({ op: "eq", text: a[i], aLine: ++ai, bLine: ++bi });
  return out;
}

export function toHunks(lines: DiffLine[], context = 3): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: DiffLine[] = [];
  let pending: DiffLine[] = [];
  let eqRun = 0;
  let n = 0;

  const flush = () => {
    if (!cur.length) return;
    const added = cur.filter((l) => l.op === "add").length;
    const removed = cur.filter((l) => l.op === "del").length;
    if (added || removed) {
      hunks.push({
        id: `h${n++}`,
        aStart: cur.find((l) => l.aLine)?.aLine ?? 0,
        bStart: cur.find((l) => l.bLine)?.bLine ?? 0,
        lines: cur,
        added,
        removed,
      });
    }
    cur = [];
  };

  for (const l of lines) {
    if (l.op === "eq") {
      eqRun++;
      pending.push(l);
      if (cur.length && eqRun > context * 2) {
        cur.push(...pending.slice(0, context));
        flush();
        pending = pending.slice(-context);
      }
    } else {
      if (!cur.length) pending = pending.slice(-context);
      cur.push(...pending, l);
      pending = [];
      eqRun = 0;
    }
  }
  if (cur.length) {
    cur.push(...pending.slice(0, context));
    flush();
  }
  return hunks;
}

export function diffStats(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.op === "add") added++;
    else if (l.op === "del") removed++;
  }
  return { added, removed };
}

/** Rebuild file content applying only the accepted hunks. */
export function applyHunks(original: string, lines: DiffLine[], accepted: Set<string>, hunks: Hunk[]): string {
  const hunkOf = new Map<DiffLine, string>();
  hunks.forEach((h) => h.lines.forEach((l) => { if (l.op !== "eq") hunkOf.set(l, h.id); }));
  const out: string[] = [];
  for (const l of lines) {
    if (l.op === "eq") out.push(l.text);
    else {
      const hid = hunkOf.get(l);
      const on = hid ? accepted.has(hid) : true;
      if (l.op === "add" && on) out.push(l.text);
      if (l.op === "del" && !on) out.push(l.text);
    }
  }
  void original;
  return out.join("\n");
}

export function unifiedPatch(path: string, aText: string, bText: string): string {
  const hunks = toHunks(diffLines(aText, bText));
  if (!hunks.length) return `--- a/${path}\n+++ b/${path}\n(no changes)`;
  const body = hunks
    .map((h) => {
      const head = `@@ -${h.aStart},${h.lines.filter((l) => l.op !== "add").length} +${h.bStart},${
        h.lines.filter((l) => l.op !== "del").length
      } @@`;
      const rows = h.lines.map((l) => (l.op === "eq" ? " " : l.op === "add" ? "+" : "-") + l.text);
      return [head, ...rows].join("\n");
    })
    .join("\n");
  return `--- a/${path}\n+++ b/${path}\n${body}`;
}
