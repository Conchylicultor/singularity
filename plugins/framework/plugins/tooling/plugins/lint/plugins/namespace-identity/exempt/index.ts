import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "namespace-identity/no-ambient-worktree-env",
    paths: ["lint/no-ambient-worktree-env.ts"],
    kind: "sanctioned",
    reason:
      "The rule file has to spell the name it bans (rule files are linted repo-wide, and splitting the literal would make the one place that defines the ban unreadable), and its test's fixtures are the ban's own worked examples.",
  },
] satisfies Exemptions;
