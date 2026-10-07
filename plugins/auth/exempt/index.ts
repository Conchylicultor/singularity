import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "timer/no-unlisted-timer",
    paths: ["central/internal/refresh-loop.ts"],
    kind: "sanctioned",
    reason:
      "The central runtime has no job queue, so its one periodic task (refresh OAuth tokens before they expire) can only be a timer.",
  },
] satisfies Exemptions;
