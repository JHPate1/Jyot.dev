/**
 * External-change detection.
 *
 * The File System Access API has no change events, so we run a tiered poller:
 *   - HOT tier  : open tabs, checked every `hotMs` (cheap: getFile() metadata only)
 *   - COLD tier : whole tree re-stat on `coldMs` when the document is visible
 * Polling pauses entirely on `visibilitychange` → hidden, so a background tab
 * costs zero CPU. Signatures are `size:mtime` strings, never file contents,
 * which keeps the watcher allocation-free on large repos.
 */
import type { VFS, VNode } from "./types";
import { flattenFiles } from "./types";

export interface WatchEvent {
  type: "changed" | "created" | "deleted";
  path: string;
}

export interface WatcherOptions {
  hotMs?: number;
  coldMs?: number;
  onEvents: (events: WatchEvent[]) => void;
  hotPaths: () => string[];
}

export class FsWatcher {
  private fs: VFS;
  private opts: Required<Omit<WatcherOptions, "onEvents" | "hotPaths">> & WatcherOptions;
  private sigs = new Map<string, string>();
  private hotTimer: number | null = null;
  private coldTimer: number | null = null;
  private running = false;

  constructor(fs: VFS, opts: WatcherOptions) {
    this.fs = fs;
    this.opts = { hotMs: 1500, coldMs: 6000, ...opts };
  }

  async primeFromTree(tree: VNode) {
    this.sigs.clear();
    for (const f of flattenFiles(tree)) this.sigs.set(f.path, `${f.size ?? 0}:${f.mtime ?? 0}`);
  }

  start() {
    if (this.running) return;
    this.running = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.schedule();
  }

  stop() {
    this.running = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.hotTimer) clearTimeout(this.hotTimer);
    if (this.coldTimer) clearTimeout(this.coldTimer);
  }

  private onVisibility = () => {
    if (document.hidden) {
      if (this.hotTimer) clearTimeout(this.hotTimer);
      if (this.coldTimer) clearTimeout(this.coldTimer);
    } else {
      this.schedule();
    }
  };

  private schedule() {
    if (!this.running || document.hidden) return;
    this.hotTimer = window.setTimeout(() => this.tickHot(), this.opts.hotMs);
    this.coldTimer = window.setTimeout(() => this.tickCold(), this.opts.coldMs);
  }

  /** Update the recorded signature after *we* write, so we don't self-trigger. */
  async touch(path: string) {
    const st = await this.fs.stat(path);
    if (st) this.sigs.set(path, `${st.size}:${st.mtime}`);
    else this.sigs.delete(path);
  }

  private async tickHot() {
    if (!this.running || document.hidden) return;
    const events: WatchEvent[] = [];
    for (const p of this.opts.hotPaths().slice(0, 24)) {
      const st = await this.fs.stat(p);
      const prev = this.sigs.get(p);
      if (!st) {
        if (prev !== undefined) {
          this.sigs.delete(p);
          events.push({ type: "deleted", path: p });
        }
        continue;
      }
      const sig = `${st.size}:${st.mtime}`;
      if (prev !== undefined && prev !== sig) events.push({ type: "changed", path: p });
      this.sigs.set(p, sig);
    }
    if (events.length) this.opts.onEvents(events);
    if (this.running && !document.hidden) this.hotTimer = window.setTimeout(() => this.tickHot(), this.opts.hotMs);
  }

  private async tickCold() {
    if (!this.running || document.hidden) return;
    try {
      if ("invalidate" in (this.fs as any)) (this.fs as any).invalidate();
      const tree = await this.fs.listTree();
      const seen = new Set<string>();
      const events: WatchEvent[] = [];
      for (const f of flattenFiles(tree)) {
        seen.add(f.path);
        const sig = `${f.size ?? 0}:${f.mtime ?? 0}`;
        const prev = this.sigs.get(f.path);
        if (prev === undefined) events.push({ type: "created", path: f.path });
        else if (prev !== sig) events.push({ type: "changed", path: f.path });
        this.sigs.set(f.path, sig);
      }
      for (const p of [...this.sigs.keys()]) {
        if (!seen.has(p)) {
          this.sigs.delete(p);
          events.push({ type: "deleted", path: p });
        }
      }
      if (events.length) this.opts.onEvents(events);
    } catch {
      /* transient permission loss */
    }
    if (this.running && !document.hidden) this.coldTimer = window.setTimeout(() => this.tickCold(), this.opts.coldMs);
  }
}
