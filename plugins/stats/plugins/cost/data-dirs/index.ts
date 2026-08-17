import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The host-global cost/usage archive: the incremental transcript index
 * (`index.json`), the resolved model price table (`price-table.json`) and the
 * year-sharded permanent archive (`sessions-<YYYY>.json`).
 *
 * Host-global because the Claude transcript corpus it summarizes is shared by
 * every backend — the aggregate is identical across worktrees, so it lives under
 * the host root rather than in a per-worktree DB.
 */
export const costUsageDir = defineDataDir({
  kind: "state",
  name: "cost-usage",
  owner: "stats/cost",
  description:
    "Host-global usage archive: the incremental transcript index, the resolved price table, and the year-sharded permanent session archive",
  // The archive deliberately outlives its source: Claude Code deletes old
  // transcripts, and the year shards are then the ONLY record of that spend.
  // Nothing reclaims it, and that is the point.
  reclaim: {
    kind: "never",
    reason:
      "the year-sharded archive outlives the transcripts it was built from, so deleting it loses that spend history irrecoverably",
  },
  // TEMPORARY. Byte-for-byte where it is today; the layout migration relocates
  // it under `state/`.
  legacyLocation: {
    path: "cost-usage",
    reason: "not yet moved; relocates in the layout migration",
  },
});

export default [costUsageDir];
