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
 * `legacyLocation` pins it to the name it occupies at the root today. Nothing
 * moves on disk in this commit, so the path stays byte-for-byte what
 * `join(SINGULARITY_DIR, "closure-cache")` produced.
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
  legacyLocation: {
    path: "closure-cache",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [closureCacheDir];
