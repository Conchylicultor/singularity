import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { SlowOpSchema } from "@plugins/debug/plugins/slow-ops/core";

// One worktree's contribution to the cluster fan-out. `ops` are the raw per-row
// `slow_ops` aggregates from that worktree's own forked DB — the web layer does
// all the cross-worktree merge (aggregate + timeline) so the merge logic stays
// client-side and unit-testable. On a per-DB failure (old-schema fork, stale
// fork, connection refused) the row is surfaced with `ok: false` + `error`
// rather than blanking the whole view — loud-but-resilient.
const ClusterWorktreeSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  ops: z.array(SlowOpSchema),
});
export type ClusterWorktree = z.infer<typeof ClusterWorktreeSchema>;

const clusterResponseSchema = z.object({
  worktrees: z.array(ClusterWorktreeSchema),
});

// PULL, user-triggered (Refresh button) — never live/polled. A cross-worktree
// fan-out is too heavy and too rarely needed to run on a live resource.
export const getSlowOpsCluster = defineEndpoint({
  route: "GET /api/slow-ops/cluster",
  response: clusterResponseSchema,
});
