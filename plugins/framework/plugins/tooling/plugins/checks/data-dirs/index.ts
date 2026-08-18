import { defineDataDir } from "@plugins/infra/plugins/paths/core";

// The three directories the check runner owns under the data root. All are
// HOST-GLOBAL rather than per-worktree, which is the property that makes them
// worth declaring: every worktree's check run reads and writes the same entries,
// so "who owns this?" had no answer before the registry existed.

/** @see plugins/framework/plugins/tooling/plugins/checks/core/cache.ts */
export const checkCacheDir = defineDataDir({
  kind: "cache",
  name: "check",
  owner: "framework/tooling/checks",
  description:
    "Recorded check verdicts, keyed by (working-tree hash, check id) so the main auto-build reuses passes an agent worktree already recorded",
  reclaim: { kind: "safe" },
});

/** @see plugins/framework/plugins/tooling/plugins/checks/core/warm-base.ts */
export const tsBuildInfoPoolDir = defineDataDir({
  kind: "cache",
  name: "tsbuildinfo",
  owner: "framework/tooling/checks",
  description:
    "Recency-selected pool of published `.tsbuildinfo` warm bases, partitioned by (typescript version, tsconfig target)",
  reclaim: { kind: "safe" },
});

/**
 * The progress log family: `check-progress.jsonl` plus the two rotations
 * `defineFileSink` keeps beside it.
 *
 * A directory rather than three loose files at the root, because the rotations
 * ARE the history: a reader that opens only the live file silently truncates it
 * at the last rotation. Keeping the family in one declared directory is what
 * makes "read the log" and "read the whole log" the same operation.
 *
 * @see plugins/framework/plugins/tooling/plugins/checks/core/progress-log.ts
 */
export const checkProgressLogDir = defineDataDir({
  kind: "logs",
  name: "check-progress",
  owner: "framework/tooling/checks",
  description:
    "Per-check-run progress log (`check-progress.jsonl` + rotations): one JSONL line per run open, per-check verdict and completion, host-global across worktrees",
  // Observability output. Losing it costs the record of a past check run, never
  // anything a future one needs — a dropped log re-runs the checks, it does not
  // change their verdict.
  reclaim: { kind: "safe" },
});

export default [checkCacheDir, tsBuildInfoPoolDir, checkProgressLogDir];
