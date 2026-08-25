export interface Section {
  id: string;
  title: string;
  body: string;
}

export const BLUEPRINT: Section[] = [
  {
    id: "overview",
    title: "1. How Kode Works",
    body: `
**Kode** is a clean, local code editor that runs directly in your web browser. When you select a folder on your computer, Kode opens those files directly—your code stays 100% on your machine and never gets uploaded to a cloud server.

### Why end users love Kode:
- **Instant startup**: No 2 GB desktop app installer needed.
- **Review every change**: When you ask the assistant to update a file, Kode shows you a clear side-by-side comparison so you can accept or cancel the change.
- **Works with any folder**: Open any project on your PC or Mac and start editing right away.
`.trim(),
  },
  {
    id: "safety",
    title: "2. Change Review & Safety",
    body: `
### You Stay in Control

Whenever the assistant writes or edits code:
1. **Pending Changes tab**: The proposed edits open automatically in the **Review Changes** panel.
2. **Line-by-line diff**: Additions appear in green (+) and removals appear in red (-).
3. **Save or Discard**: Click **Save Changes** to save the update to your computer, or **Discard** to keep your original file untouched.
4. **Undo History**: Made a mistake? Click the **Undo** arrow in the history list to roll back any assistant edit.
`.trim(),
  },
  {
    id: "privacy",
    title: "3. Privacy & Files",
    body: `
### Local File Access

Kode uses your browser's standard folder picker:
- Only folders you explicitly choose can be opened.
- Your files are saved directly to your disk when you press **⌘S** (Mac) or **Ctrl+S** (Windows/Linux).
- Search indexing happens locally inside your browser tab.
`.trim(),
  },
  {
    id: "ai",
    title: "4. NVIDIA AI Assistant",
    body: `
### Built-in Coding Helper

Kode includes a built-in coding assistant powered by **NVIDIA Nemotron (nvidia/nemotron-3-super-120b-a12b)**.

- **Ask Questions mode**: Ask for explanations, bug reviews, or advice without modifying files.
- **Make Changes mode**: Let the assistant prepare edits across your files for you to review.
- **Custom API Key**: You can use the included default NVIDIA key or paste your own in **Settings**.
`.trim(),
  },
];
