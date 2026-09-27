import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listSlowOps } from "../../core";
import { _slowOps } from "./tables";

// The table row type and the `SlowOp` wire schema both derive from the single
// `slowOpFields` record (core), so `_slowOps.$inferSelect ≡ SlowOp` by
// construction — the rows are returned verbatim with no projection and no
// drift guard needed.
//
// Ranked by aggregate impact (total time desc) — the view's default ordering.
export const handleListSlowOps = implement(listSlowOps, async () =>
  db.select().from(_slowOps).orderBy(desc(_slowOps.totalMs)),
);
