import noRawBunSpawn from "./no-raw-bun-spawn";

export default {
  name: "spawn-safety",
  rules: {
    "no-raw-bun-spawn": noRawBunSpawn,
  },
  /**
   * Globs where the rule is not enforced, keyed by rule id. The root eslint.config
   * reads this generically and flips the rule off for these paths — it never
   * names this rule or these files itself.
   *
   * - TEST files: a test spinning up a throwaway child (git fixtures, the
   *   rule's own RuleTester strings) is scaffolding, not a durable spawn site;
   *   production spawn code always lives outside tests, which the rule still
   *   guards. (Mirrors sink-safety's test exemption.)
   * - Plugin server trees: Stage 2 — the server-side migration (~65 sites) is
   *   deferred until Stage 1 demonstrably stops the field cli-op-wedge reports;
   *   tracked by the Stage-2 follow-up task. TEMPORARY: each Stage-2 batch
   *   shrinks this glob.
   * - `migrations-interactive.ts`: the ONE genuinely streaming site —
   *   drizzle-kit's interactive create-vs-rename prompts must be parsed from
   *   live stdout while keystrokes are written back to stdin, which is
   *   impossible over after-exit temp files. Extracted into its own file so
   *   this ignore stays surgical.
   * - The research tree: the wedge repro deliberately exercises the bug.
   */
  ignores: {
    "no-raw-bun-spawn": [
      "**/*.test.ts",
      "**/*.test.tsx",
      "plugins/**/server/**",
      "plugins/framework/plugins/cli/bin/migrations-interactive.ts",
      "research/**",
    ],
  },
};
