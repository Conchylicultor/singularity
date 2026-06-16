import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { SlowOpSchema, type SlowOp } from "../../core";
import { _slowOps } from "./tables";

// Ranked by aggregate impact (total time desc) — the view's default ordering.
export const slowOpsResource = defineResource({
  key: "slow-ops",
  mode: "push",
  schema: z.array(SlowOpSchema),
  loader: async (): Promise<SlowOp[]> => {
    const rows = await db
      .select()
      .from(_slowOps)
      .orderBy(desc(_slowOps.totalMs));
    return rows.map((r) => ({
      id: r.id,
      worktree: r.worktree,
      operationKind: r.operationKind,
      operation: r.operation,
      count: r.count,
      totalMs: r.totalMs,
      maxMs: r.maxMs,
      lastMs: r.lastMs,
      thresholdMs: r.thresholdMs,
      callers: r.callers,
      recentSamples: r.recentSamples,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
    }));
  },
});
