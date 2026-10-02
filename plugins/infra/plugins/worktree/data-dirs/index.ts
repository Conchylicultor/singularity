import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The op-signal directory: one empty file per worktree slug, touched whenever
 * one of that worktree's op markers (`worktrees/<slug>/ops/*.json`) is
 * published, released or reaped (`server/internal/worktree-op.ts`). A watcher
 * that wants "an op started or ended somewhere" watches this ONE flat directory
 * instead of every worktree's data dir recursively — which also holds build
 * outputs a single build writes thousands of files into.
 *
 * Host-global because the markers are: every checkout's CLI and backend writes
 * here. A file's content means nothing — only that it was touched, and the
 * markers themselves stay the authority on what runs — so nothing is lost by
 * deleting one; files untouched for a day are pruned.
 */
export const opSignalsDir = defineDataDir({
  kind: "state",
  name: "worktree-op-signals",
  owner: "infra/worktree",
  description:
    "Empty wake-up files, one per worktree slug, touched whenever that worktree's op markers change so watchers need not watch every worktree dir",
  reclaim: { kind: "ttl", ttlDays: 1 },
});

export default [opSignalsDir];
