import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

export interface SnapshotBloat {
  /** On-disk size of the `live_state_snapshot` table incl. indexes/TOAST, bytes. */
  tableBytes: number;
  /** Dead (vacuumable) tuples — the bloat that inflates the persisted read. */
  deadTuples: number;
  /** Live tuples — the actual boot-critical rows. */
  liveTuples: number;
}

// One read-only probe of the `live_state_snapshot` table's physical footprint, so
// the warm-mode persisted-read timing can be read against real dead-tuple bloat
// (which only reproduces against an actually-bloated DB, i.e. main). Raw SQL on
// `db` (matches fixtures.ts — no cross-plugin table imports). The dead/live tuple
// counts come from `pg_stat_user_tables`; the size from `pg_total_relation_size`.
// Subqueries (not a join) keep the size readable even when the table has no
// stat row yet, and the no-FROM SELECT always returns exactly one row.
export async function readSnapshotBloat(): Promise<SnapshotBloat> {
  const res = await db.execute<{
    table_bytes: string | number;
    dead_tuples: string | number;
    live_tuples: string | number;
  }>(sql`
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
  `);
  const row = res.rows[0];
  // bigint columns arrive as strings via postgres; Number() coerces safely (table
  // size and tuple counts sit well below 2^53).
  return {
    tableBytes: Number(row?.table_bytes ?? 0),
    deadTuples: Number(row?.dead_tuples ?? 0),
    liveTuples: Number(row?.live_tuples ?? 0),
  };
}
