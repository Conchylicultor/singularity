import { sql as drizzleSql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { routeChange } from "@plugins/database/plugins/change-feed/server";
import type { DbChange } from "@plugins/database/plugins/change-feed/server";
import {
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
} from "@plugins/database/plugins/derived-views/core";
import { snapshotLog as log } from "./log-sink";

// `db.execute<T>` constrains `T extends Record<string, unknown>`, so this carries
// an index signature. The fields are the changelog columns the catch-up reads.
type ChangelogRow = {
  xid: string;
  t: string;
  op: "I" | "U" | "D";
  ids: string[] | null;
} & Record<string, unknown>;

// Replay one changelog row through the EXACT same cascade the live listener uses
// (change-feed's exported `routeChange`). Catch-up ≡ "replay the missed changelog
// rows as if they had just arrived over NOTIFY" — reusing `routeChange` makes that
// true by construction and prevents drift. DELETE and null-ids rows degrade to
// FULL: a delete/membership change cannot be a scoped recompute (a scoped path
// never asserts membership), so the scoped ids are dropped before routing. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.5.
function replayChange(row: ChangelogRow, route: (change: DbChange) => void): void {
  const ids = row.op === "D" ? null : row.ids;
  route({ table: row.t, op: row.op, ids });
}

// Bounded cold-boot catch-up: replay only the changelog rows committed at or after
// the OLDEST persisted snapshot watermark (the conservative floor — every snapshot
// already incorporates everything strictly older). Usually empty after a short
// deploy. Each replayed row flows through the recompute cascade → push to
// subscribers → re-persist with a fresh watermark, advancing the floor.
//
// Backstop (§3.5 step 5): if the oldest snapshot's floor predates the oldest
// RETAINED changelog row (a snapshot older than the prune horizon), the missing
// history means catch-up can't prove that resource current — so the universe of
// changed tables is FULL-recomputed unconditionally and logged loudly. The
// listener's connect-time fullSweep covers currently-subscribed resources as
// additional defense-in-depth.
//
// Catch-up is the bounded boot driver. It routes every replayed row through
// `routeChange → applyDbChange`, which inverts the IN-MEMORY read-set index
// (`table → resource`). That index is seeded at boot from the persisted
// `tables_read` column (live-state-snapshot's `onReadyBlocking`), so catch-up
// works at a cold boot with NO loader having run — previously it depended on the
// warm/fullSweep path having populated the index first. It also relies on the
// post-LISTEN ordering documented at the call site in `server/index.ts`: this runs
// after change-feed's listener has its LISTEN up, so a commit landing after the
// `SELECT` below is delivered on the live path (no gap).
export async function runCatchUp(
  db: NodePgDatabase,
  route: (change: DbChange) => void = routeChange,
): Promise<void> {
  const floorRes = await db.execute<{ min_position: string | null }>(
    drizzleSql.raw(
      `SELECT min(position)::text AS min_position FROM ${LIVE_STATE_SNAPSHOT_TABLE}`,
    ),
  );
  const minPosition = floorRes.rows[0]?.min_position ?? null;
  if (minPosition === null) {
    // No persisted snapshots yet (first-ever boot) — nothing to catch up. The
    // boot-snapshot endpoint falls back to from-scratch loads, which persist.
    return;
  }

  // Oldest retained changelog row. If our floor is older than it, history was
  // pruned out from under a stale snapshot → FULL backstop below.
  const oldestRes = await db.execute<{ min_xid: string | null }>(
    drizzleSql.raw(
      `SELECT min(xid)::text AS min_xid FROM ${LIVE_STATE_CHANGELOG_TABLE}`,
    ),
  );
  const oldestRetained = oldestRes.rows[0]?.min_xid ?? null;

  // Compare as BigInt (xid8 stored as numeric; values are non-negative integers).
  const floor = BigInt(minPosition);
  if (oldestRetained !== null && BigInt(oldestRetained) > floor) {
    // Missing-history backstop: the changelog no longer retains rows back to our
    // oldest snapshot floor (server was down longer than the prune cap). We cannot
    // bound which resources changed, so FULL-recompute the universe of changed
    // tables (applyDbChange fans each out to every reading resource).
    log.publish(
      `[live-state-snapshot] WARNING: oldest retained changelog xid ${oldestRetained} > snapshot floor ${minPosition} — history pruned past a stale snapshot; forcing FULL recompute of all changed tables`,
      "stderr",
    );
    await fullRecomputeChangedTables(db, route);
    return;
  }

  const rows = await db.execute<ChangelogRow>(
    drizzleSql`
      SELECT xid::text AS xid, t, op, ids
      FROM ${drizzleSql.raw(LIVE_STATE_CHANGELOG_TABLE)}
      WHERE xid >= ${minPosition}::numeric
      ORDER BY seq
    `,
  );

  if (rows.rows.length === 0) {
    log.publish("[live-state-snapshot] catch-up: no changelog rows since floor — already current");
    return;
  }

  log.publish(
    `[live-state-snapshot] catch-up: replaying ${rows.rows.length} changelog row(s) since floor xid ${minPosition}`,
  );
  for (const row of rows.rows) replayChange(row, route);
}

// FULL backstop: route a null-ids FULL change for every DISTINCT table seen in the
// retained changelog (the universe of tables that have changed). `applyDbChange`
// fans each out to every reading resource, so persisted resources whose tables
// changed get a FULL recompute. The rare, loud missing-history path.
async function fullRecomputeChangedTables(
  db: NodePgDatabase,
  route: (change: DbChange) => void,
): Promise<void> {
  const tablesRes = await db.execute<{ t: string }>(
    drizzleSql.raw(`SELECT DISTINCT t FROM ${LIVE_STATE_CHANGELOG_TABLE}`),
  );
  for (const { t } of tablesRes.rows) {
    replayChange({ xid: "0", t, op: "U", ids: null }, route);
  }
}
