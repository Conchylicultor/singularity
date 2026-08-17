import { defineDataDir } from "@plugins/infra/plugins/paths/core";

// The two directories the check runner owns under the data root. Both are
// HOST-GLOBAL rather than per-worktree, which is the property that makes them
// worth declaring: every worktree's check run reads and writes the same entries,
// so "who owns this?" had no answer before the registry existed.
//
// The check-progress log (`check-progress.jsonl` + its two rotations) is
// deliberately NOT here. It is a loose FILE at the root, and a `DataDir` names a
// directory; the three files move into `logs/check-progress/` together in the
// layout migration and are declared then, as one family.
//
// Both declarations below carry a `legacyLocation` pinning them to the name they
// occupy at the root TODAY. Nothing moves on disk in this commit — a declaration
// resolving to its real `<kind>/<name>` home would point at a directory that does
// not exist, and the consumer would silently read an empty cache. The paths
// therefore stay byte-for-byte what `join(SINGULARITY_DIR, …)` produced; the
// entries relocate in the layout migration, which drops these blocks in the same
// commit that renames them.

const NOT_YET_MOVED = "not yet moved; relocates in the layout migration";

/** @see plugins/framework/plugins/tooling/plugins/checks/core/cache.ts */
export const checkCacheDir = defineDataDir({
  kind: "cache",
  name: "check",
  owner: "framework/tooling/checks",
  description:
    "Recorded check verdicts, keyed by (working-tree hash, check id) so the main auto-build reuses passes an agent worktree already recorded",
  reclaim: { kind: "safe" },
  legacyLocation: { path: "check-cache", reason: NOT_YET_MOVED },
});

/** @see plugins/framework/plugins/tooling/plugins/checks/core/warm-base.ts */
export const tsBuildInfoPoolDir = defineDataDir({
  kind: "cache",
  name: "tsbuildinfo",
  owner: "framework/tooling/checks",
  description:
    "Recency-selected pool of published `.tsbuildinfo` warm bases, partitioned by (typescript version, tsconfig target)",
  reclaim: { kind: "safe" },
  legacyLocation: { path: "tsbuildinfo", reason: NOT_YET_MOVED },
});

export default [checkCacheDir, tsBuildInfoPoolDir];
