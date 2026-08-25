export interface Section { id: string; title: string; body: string; }

export const BLUEPRINT: Section[] = [
  {
    id: "how",
    title: "How it works",
    body: `
Seeker Code is a code editor that runs in your browser. You choose a folder on your computer, and Seeker opens it directly — no upload, no cloud copy.

- Open any project on your Mac or PC and edit like a normal app.
- All changes are saved straight to your files when you press Save.
- The editor works fast even with hundreds of files.

You are always in control of what gets saved.
`.trim(),
  },
  {
    id: "assistant",
    title: "Meet Seeker Pro 1.2",
    body: `
Seeker Pro 1.2 is your main assistant in Seeker Code.

- **Your name is Seeker Pro 1.2** — built by Seeker Code to help anyone code.
- Ask it to explain a file, find bugs, or clean up code.
- It shows its thinking steps so you can follow along.
- It never saves without your permission.

If you ask who it is, it will say: "I'm Seeker Pro 1.2, your coding assistant in Seeker Code."

Other team members:
- **Seeker Perplex** — deep builder, great at implementing features and fixing tricky bugs.
- **Seeker Code Flash** — lightning-fast editor for quick cleanups and small fixes.

You can talk to them individually or launch them as a team.
`.trim(),
  },
  {
    id: "review",
    title: "Review changes",
    body: `
When Seeker suggests edits:

1. Open the **Review** tab. You will see each file that changed.
2. Additions are green (+), removals are red (-).
3. You can include or exclude individual sections.
4. Click **Save All Changes** to write to your computer, or **Discard** to cancel.

If you make a mistake, open **Review** → **Undo History** and restore an earlier version.
`.trim(),
  },
  {
    id: "team",
    title: "Team mode",
    body: `
Team mode lets Seeker Pro 1.2 act as an architect.

1. Go to the **Team** tab.
2. Describe what you want — for example: "Add a search bar and clock to the home page."
3. Seeker Pro 1.2 splits the work: Seeker Perplex builds features, Seeker Code Flash polishes.
4. They work at the same time and share updates live.
5. All results appear in **Review** for you to approve.

You only need one API key in Settings — it is used for all three Seekers.
`.trim(),
  },
  {
    id: "privacy",
    title: "Privacy",
    body: `
- Your files stay on your computer. Seeker Code does not upload your project to a server.
- Only text you type and relevant file snippets are sent to NVIDIA to generate help.
- Your API key is stored only in this browser.
- You can use the included default key or paste your own in Settings.
`.trim(),
  },
];
