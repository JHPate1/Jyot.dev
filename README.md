# Kode — Local Code Editor & AI Assistant

Kode is a browser-based code editor that works directly on your local filesystem using the Web File System Access API.

## Highlights

- **Direct disk access**: Open any directory on your computer (`showDirectoryPicker`) with persistent read/write permissions.
- **Under 250 MB memory usage**: Built with CodeMirror 6 and background BM25 indexing instead of heavy background compilers.
- **Reviewable diffs**: Tool modifications show up as line-by-line staging diffs where you can accept or discard hunks.
- **NVIDIA Nemotron integration**: Uses `nvidia/nemotron-3-super-120b-a12b` via server-sent events (`stream: true`) with collapsible reasoning traces.

## Getting Started

```bash
npm install
npm run dev      # Local server at http://localhost:5173
npm run build    # Produces single-file dist/index.html
```

## Configuring NVIDIA NIM

The default API key is set in `src/lib/ai/config.ts`:

```ts
export const DEFAULT_API_KEY =
  import.meta.env.VITE_NVIDIA_API_KEY ||
  "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";
```

You can update it directly in `src/lib/ai/config.ts`, via `VITE_NVIDIA_API_KEY`, or inside the Settings modal in the app.
