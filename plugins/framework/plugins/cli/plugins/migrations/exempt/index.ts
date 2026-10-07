import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spawn-safety/no-raw-bun-spawn",
    paths: ["cli/migrations-interactive.ts"],
    kind: "sanctioned",
    reason:
      "drizzle-kit's interactive create-vs-rename prompts must be parsed from live stdout while keystrokes are written back to stdin, which is impossible over after-exit temp files.",
  },
] satisfies Exemptions;
