import noRawBunSpawn from "./no-raw-bun-spawn";
import type { LintContribution } from "@plugins/framework/plugins/tooling/plugins/lint/core";

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
   * - Plugin server trees: WAS one directory glob covering every plugin server
   *   tree, then an explicit file list of 31, later down to 11 permanent ones
   *   below. The glob made "31 files are exempt because of where they live"
   *   invisible; the list says which files and why, one line each. It shrank by
   *   deletion as sites migrated, and the migratable half is now gone — what is
   *   left is only what temp-file capture structurally cannot do.
   * - `migrations-interactive.ts`: drizzle-kit's interactive create-vs-rename
   *   prompts must be parsed from live stdout while keystrokes are written back
   *   to stdin, which is impossible over after-exit temp files. Extracted into
   *   its own file so this ignore stays surgical.
   * - The research tree: the wedge repro deliberately exercises the bug.
   */
  outOfScope: {
    "no-raw-bun-spawn": ["research"],
  },
} satisfies LintContribution;
