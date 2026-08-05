import { createHash } from "node:crypto";
import { count, max } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { deployRunsRevisionResource as deployRunsRevisionDescriptor } from "../../core/runs";
import { _deployRuns } from "./tables";

// The deploy ledger's invalidation tick. Reads ONLY coarse, real-change facts —
// per (deployment, status) bucket counts plus the totals and the two watermarks
// — hashed to a scalar `rev`. It deliberately reads no transient column, so
// `mode:"push"`'s no-op suppression fires it on genuine changes only (a run
// opened, a run finished) and not on every recompute.
//
// Whole-table rather than per-deployment: a keyed resource would need the
// deployment id as a param and gain nothing, because the ledger only changes
// while a run is in flight — which the exclusivity guard caps at one per server.
// The history DataView keeps `rev` OUT of its query key and refetches its loaded
// window in place when it moves.
export const deployRunsRevisionServerResource = defineResource(
  deployRunsRevisionDescriptor,
  {
    mode: "push",
    debounceMs: 250,
    loader: async (): Promise<{ rev: string }> => {
      const bucketRows = await db
        .select({
          deploymentId: _deployRuns.deploymentId,
          status: _deployRuns.status,
          c: count(),
        })
        .from(_deployRuns)
        .groupBy(_deployRuns.deploymentId, _deployRuns.status);
      const [agg] = await db
        .select({
          total: count(),
          maxStarted: max(_deployRuns.startedAt),
          maxFinished: max(_deployRuns.finishedAt),
        })
        .from(_deployRuns);

      const buckets = bucketRows
        .map((r) => `${r.deploymentId} ${r.status}:${r.c}`)
        .sort()
        .join(",");
      const payload = JSON.stringify({
        buckets,
        total: agg?.total ?? 0,
        maxStarted: agg?.maxStarted ? new Date(agg.maxStarted).toISOString() : null,
        maxFinished: agg?.maxFinished ? new Date(agg.maxFinished).toISOString() : null,
      });
      return { rev: createHash("sha1").update(payload).digest("hex") };
    },
  },
);
