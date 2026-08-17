import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The crash buffer: one `<worktree>.jsonl` per namespace, appended
 * synchronously from `uncaughtException` (where the async Postgres driver
 * cannot run) and flushed into the reports table on the next boot.
 *
 * Host-global rather than per-worktree on purpose — a re-fork or a branch switch
 * must not wipe the record of the crash that preceded it.
 */
export const reportsBufferDir = defineDataDir({
  kind: "state",
  name: "reports",
  owner: "reports",
  description:
    "Crash reports buffered to JSONL during a dying event loop (one file per namespace), flushed into the reports table on the next boot",
  // Between the crash and the next boot's flush, these lines ARE the crash
  // record — the DB has nothing. Deleting them loses the report entirely.
  reclaim: {
    kind: "never",
    reason:
      "a buffered line is the only record of that crash until the next boot flushes it into the DB",
  },
  // TEMPORARY. Byte-for-byte where it is today; the layout migration relocates
  // it under `state/`.
  legacyLocation: {
    path: "reports",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [reportsBufferDir];
