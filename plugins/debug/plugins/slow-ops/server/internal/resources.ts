import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { SlowOpSchema, type SlowOp } from "../../core";
import { _slowOps } from "./tables";

// The table row type and the `SlowOp` wire schema both derive from the single
// `slowOpFields` record (core), so `_slowOps.$inferSelect ≡ SlowOp` by
// construction — the loader returns `db.select()` rows verbatim with no
// projection and no drift guard needed.

// Ranked by aggregate impact (total time desc) — the view's default ordering.
export const slowOpsResource = defineResource({
  key: "slow-ops",
  mode: "push",
  schema: z.array(SlowOpSchema),
  loader: async (): Promise<SlowOp[]> =>
    db.select().from(_slowOps).orderBy(desc(_slowOps.totalMs)),
});
