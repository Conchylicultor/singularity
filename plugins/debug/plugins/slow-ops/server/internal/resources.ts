import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { SlowOpSchema, type SlowOp } from "../../core";
import { _slowOps } from "./tables";

// Compile-time guard: the table's inferred row type MUST equal the wire shape
// `SlowOp` exactly. The loader returns `db.select()` rows verbatim (no hand
// projection), so a column added to the table + zod schema but forgotten
// elsewhere — or a drift between the two — is a loud `tsc` error here instead of
// a silently dropped field (`recentSamples` was lost this way once). This is the
// cheap Stage-0 fix; it is superseded by the fields-unified `defineEntity`
// (research/2026-06-17-global-fields-unified-entities.md, Stage D), which makes
// the row shape derive from the field record so drift becomes unrepresentable.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;
// Exported so `noUnusedLocals` keeps it (a type-test alias, not dead code).
export type _SlowOpRowMatchesWire = Expect<
  Equal<typeof _slowOps.$inferSelect, SlowOp>
>;

// Ranked by aggregate impact (total time desc) — the view's default ordering.
export const slowOpsResource = defineResource({
  key: "slow-ops",
  mode: "push",
  schema: z.array(SlowOpSchema),
  loader: async (): Promise<SlowOp[]> =>
    db.select().from(_slowOps).orderBy(desc(_slowOps.totalMs)),
});
