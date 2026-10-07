import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "marker-scan-safety/no-adhoc-marker-scan",
    paths: ["check/index.ts"],
    kind: "sanctioned",
    reason:
      "Token-in-string: asserts vitest.config.ts still contains the literal `include` glob that scopes vitest off bun:test's files. The glob IS a string literal with no enclosing marker call, so a full mask erases the one thing being asserted. Comments must still be masked — the file documents the pair in prose that quotes the same glob, and matching that prose would keep the check passing after the live directive was deleted.",
  },
] satisfies Exemptions;
