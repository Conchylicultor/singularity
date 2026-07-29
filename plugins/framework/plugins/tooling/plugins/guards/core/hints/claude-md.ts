import type { FileHint } from "../types";

export const claudeMdHint: FileHint = {
  name: "claude-md-terse",
  match: (p) => p.endsWith("/CLAUDE.md") || p.endsWith("/AGENTS.md"),
  tools: ["Write", "Edit"],
  message: [
    "A CLAUDE.md is loaded into every future agent's context — every line costs.",
    "- Keep it terse.",
    "- Only keep what's useful for future agents",
    '- Keep the WHY when a rule looks wrong, so nobody "fixes" it back.',
  ].join("\n"),
};
