import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The per-file type-check closure cache.
 *
 * Its own declaration rather than a second entry under the parent check
 * runner's, because the two caches are keyed on different things and are
 * reclaimed independently: the parent's is keyed on (tree hash, check id),
 * this one on a file's import-closure fingerprint, which is what lets a fresh
 * worktree reuse PASSes recorded by a sibling.
 *
 * @see plugins/framework/plugins/tooling/plugins/checks/plugins/type-check/check/closure-cache.ts
 */
export const closureCacheDir = defineDataDir({
  kind: "cache",
  name: "closure",
  owner: "framework/tooling/checks/type-check",
  description:
    "Per-file type-check verdicts keyed by dependency-closure fingerprint, host-global so a fresh worktree reuses a sibling's passes",
  reclaim: { kind: "safe" },
});

/**
 * The per-target program-PASS record.
 *
 * A sibling of the closure cache rather than a namespace inside it: the two are
 * keyed on different things (a file's import closure vs a whole tsc program's
 * content) and are bounded independently — this one holds a handful of entries
 * per run where that one holds thousands. The data-dir declaration is the
 * reclaim audit's description of what lives on disk, so two stores are two
 * declarations.
 *
 * Host-global for the same reason: a program key is content-addressed, so a
 * fresh worktree skips a target that main — or a sibling — already passed on an
 * identical program.
 *
 * @see plugins/framework/plugins/tooling/plugins/checks/plugins/type-check/check/program-key.ts
 */
export const programPassDir = defineDataDir({
  kind: "cache",
  name: "type-check-programs",
  owner: "framework/tooling/checks/type-check",
  description:
    "Per-tsc-target program verdicts keyed by the content of everything the program loaded, host-global so an unaffected target is not re-checked",
  reclaim: { kind: "safe" },
});

export default [closureCacheDir, programPassDir];
