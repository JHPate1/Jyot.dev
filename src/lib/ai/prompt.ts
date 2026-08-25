import type { WorkspaceIndex } from "../index/workspaceIndex";

export const TOOL_SPEC = `
## Tools

To perform actions on files, emit a fenced code block containing a single JSON object with a "tool" key and an "args" object. Use the info string \`tool\`:

\`\`\`tool
{"tool": "read_file", "args": {"path": "src/cart.ts"}}
\`\`\`

Emit ONLY the JSON inside the block — no comments, no trailing text on the same line. Put any explanation OUTSIDE the code block. After emitting tool blocks, stop and wait for the results before continuing.

Available tools:
- read_file(path, start?, end?): Read file contents with line numbers.
- list_dir(path): List contents of a folder.
- search_workspace(query, mode, regex): Search indexed files by keyword or regex.
- create_file(path, content): Stage a new file.
- write_file(path, content): Stage an overwrite of a file.
- edit_file(path, search, replace): Stage an exact search-and-replace edit. Search string must match exactly once.
- delete_file(path): Stage a file deletion.
- diff_preview(path?): Inspect currently staged changes.
- run_check(path?): Run syntax and lint checks on staged code.
- finish(summary): Complete task and present the diff for review.

Always read a file before modifying it. All mutations are staged until the user clicks Apply.
`.trim();

export function buildSystemPrompt(opts: {
  index: WorkspaceIndex | null;
  rootName: string;
  backend: string;
  openFiles: string[];
  activeFile?: { path: string; content: string; selection?: string } | null;
  agentMode: boolean;
}): string {
  const { index, rootName, backend, openFiles, activeFile, agentMode } = opts;
  const map = index?.ready ? index.repoMap(3500) : "(indexing in progress)";
  const stats = index?.ready ? index.stats() : null;

  return `You are a coding assistant inside Kode, a local browser editor.

Workspace: ${rootName} (${backend})
Index: ${stats ? `${stats.files} files, ${stats.chunks} chunks` : "pending"}
Open tabs: ${openFiles.length ? openFiles.join(", ") : "none"}
Active file: ${activeFile ? activeFile.path : "none"}
${activeFile?.selection ? `Selected text:\n\`\`\`\n${activeFile.selection.slice(0, 2000)}\n\`\`\`` : ""}

Symbol index:
\`\`\`
${map}
\`\`\`

Guidelines:
- Match existing project conventions and formatting.
- Make minimal, targeted changes. Do not rewrite unrelated code.
- Provide complete code rather than placeholders.
- Mention line numbers when referencing code (e.g. src/cart.ts:14).

${agentMode ? TOOL_SPEC : "Chat mode is active. Discuss or review code without emitting tool blocks."}`;
}

export const INLINE_EDIT_PROMPT = `Rewrite the selected code region according to the instruction. Output only the replacement code without markdown code fences or commentary. Preserve indentation.`;

export const COMPLETION_PROMPT = `Continue the source code at <CURSOR>. Output only raw code to insert. Max 3 lines.`;

export const COMMIT_PROMPT = `Write a short commit message summarizing the diff in imperative mood (under 72 chars).`;
