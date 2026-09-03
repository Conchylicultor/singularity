import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The host duress latch (`duress.latch`) — the cross-process "the box is in
 * trouble" signal the cluster sentinel writes and every backend reads.
 *
 * `locks` rather than `state` or `logs`: the file is a lease, not a record. Its
 * mtime IS the signal, it is created and unlinked over an episode's lifetime,
 * and it means nothing once the process that refreshes it has stopped — the
 * same reclaim class as the flock slot dirs beside it.
 *
 * Declaring it costs this plugin nothing it did not already pay: `defineDataDir`
 * reaches `paths/core` and nothing else, so the leaf property that lets the
 * CLI's admission valve import this plugin standalone (node:fs + infra/paths, no
 * config, no DB, no worktree identity) is intact.
 */
export const duressLatchDir = defineDataDir({
  kind: "locks",
  name: "duress",
  owner: "infra/host/duress/latch",
  description:
    "The host-global duress latch file, whose mtime freshness carries the cluster sentinel's 'the box is in trouble' lease",
  // The latch is meaningless without a live sentinel refreshing it, and it
  // self-clears in 60 s anyway. Deleting it while one IS running would end an
  // episode early and let every shed buffer resume writing into a struggling
  // box — safe once nothing is running, never while it is.
  reclaim: { kind: "restart" },
});

export default [duressLatchDir];
