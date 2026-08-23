import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeOne } from "@plugins/database/plugins/sql-rows/core";

export interface SnapshotBloat {
  /** On-disk size of the `live_state_snapshot` table incl. indexes/TOAST, bytes. */
  tableBytes: number;
  /** Dead (vacuumable) tuples — the bloat that inflates the persisted read. */
  deadTuples: number;
  /** Live tuples — the actual boot-critical rows. */
  liveTuples: number;
}

// All three columns are `int8` — `pg_total_relation_size` directly, and
// `n_dead_tup` / `n_live_tup` through a COALESCE that stays int8 — and
// node-postgres has no safe JS number for int8, so it hands all three back as
// STRINGS. That is what the schema says; the `Number()` conversions below are
// the call site's business and are safe here (table size and tuple counts sit
// well below 2^53).
const SnapshotBloatRowSchema = z.object({
  table_bytes: z.string(),
  dead_tuples: z.string(),
  live_tuples: z.string(),
});

// One read-only probe of the `live_state_snapshot` table's physical footprint, so
// the warm-mode persisted-read timing can be read against real dead-tuple bloat
// (which only reproduces against an actually-bloated DB, i.e. main). Raw SQL on
// `db` (matches fixtures.ts — no cross-plugin table imports). The dead/live tuple
// counts come from `pg_stat_user_tables`; the size from `pg_total_relation_size`.
// Subqueries (not a join) keep the size readable even when the table has no
// stat row yet, and the no-FROM SELECT always returns exactly one row — which is
// why this reads through `executeOne`: no row at all would be a broken probe,
// not a zero-sized table.
export async function readSnapshotBloat(): Promise<SnapshotBloat> {
  const row = await executeOne(db, {
    query: sql`
      SELECT
        pg_total_relation_size('live_state_snapshot') AS table_bytes,
        COALESCE(
          (SELECT n_dead_tup FROM pg_stat_user_tables WHERE relname = 'live_state_snapshot'),
          0
        ) AS dead_tuples,
        COALESCE(
          (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'live_state_snapshot'),
          0
        ) AS live_tuples
    `,
    row: SnapshotBloatRowSchema,
    label: "boot-bench snapshot bloat",
  });
  return {
    tableBytes: Number(row.table_bytes),
    deadTuples: Number(row.dead_tuples),
    liveTuples: Number(row.live_tuples),
  };
}
