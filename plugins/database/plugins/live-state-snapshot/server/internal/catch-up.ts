import { sql as drizzleSql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  executeOne,
  executeRows,
} from "@plugins/database/plugins/sql-rows/core";
import {
  readLayout,
  routeChange,
} from "@plugins/database/plugins/change-feed/server";
import type { FeedChange } from "@plugins/database/plugins/change-feed/server";
import {
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
} from "@plugins/database/plugins/derived-views/core";
import { snapshotLog as log } from "./log-sink";

// The changelog columns the catch-up reads (see CHANGELOG_TABLE_DDL in
// change-feed's triggers.ts). `xid` is a `numeric` — which pg hands back as a
// STRING, and which this query casts to `text` anyway; the value is compared as a
// BigInt below, never as a number. `op` is a `char(1)` whose only three writers
// are the trigger function's I/U/D, so the enum is the check that was previously
// a bare assertion. `ids` is the one genuinely nullable column: a bulk statement
// with no single-column PK writes NULL, which the replay routes as FULL.
//
// `keys` / `unchanged` are a routed table's key layout and known-unchanged
// column set — written by `live_state_notify_routed()` exactly as it NOTIFYs
// them, and NULL for every other table. `keys` is `jsonb` (decoded to its object), parsed by
// the same reader as the live payload so the replay routes exactly what the
// NOTIFY would have.
const ChangelogRowSchema = z.object({
  xid: z.string(),
  t: z.string(),
  op: z.enum(["I", "U", "D"]),
  ids: z.array(z.string()).nullable(),
  keys: z.unknown(),
  unchanged: z.array(z.string()).nullable(),
});
type ChangelogRow = z.infer<typeof ChangelogRowSchema>;

// `min(...)` over an empty table is NULL, so both watermark reads are nullable.
// Both are bare aggregates with no GROUP BY ⇒ exactly one row, hence `executeOne`.
const MinPositionRowSchema = z.object({ min_position: z.string().nullable() });
const MinXidRowSchema = z.object({ min_xid: z.string().nullable() });

const ChangedTableRowSchema = z.object({ t: z.string() });

// Replay one changelog row through the EXACT same cascade the live listener uses
// (change-feed's exported `routeChange`). Catch-up ≡ "replay the missed changelog
// rows as if they had just arrived over NOTIFY" — reusing `routeChange` makes that
// true by construction and prevents drift, and THAT INVARIANT requires preserving
// `row.ids` for every op (the live listener never strips them). A genuinely id-less
// bulk statement still arrives with `row.ids === null` → FULL; a non-membership
// keyed entry routes `I`/`D` to FULL regardless of ids (`applyDbChange`); only a
// membership entry gains the cheap scoped exit it already gets on the live path (a
// `D`-with-ids removes the deleted set from the snapshot with ZERO loader queries).
// See research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.5.
function replayChange(
  row: ChangelogRow,
  route: (change: FeedChange) => void,
): void {
  // The layout is read by the live NOTIFY's own rule (`readLayout`): one that
  // does not parse replays the row unscoped (FULL for its readers) rather than
  // drop it — a missed change is the one outcome catch-up exists to prevent.
  const { scope, malformed } = readLayout(row.ids, row.keys, row.unchanged);
  if (malformed) {
    log.publish(
      `[live-state-snapshot] catch-up: malformed key layout on a "${row.t}" changelog row — replaying it unscoped`,
      "stderr",
    );
  }
  // No `xid` — catch-up replays run at boot, before any client subscribes, so
  // ack attribution has no consumer here; a missing ack is safe by design (the
  // client's resub snapshot watermark backstops any op the downtime absorbed).
  // No `changedAt` either: the replay is not when the change happened.
  //
  // `unchanged` replays as written, though a catch-up follows a restart that
  // may have been a deploy that changed the routes: it lists columns KNOWN
  // equal in every row, a fact whatever gate the trigger compared under — a
  // column a new route reads that the old gate did not compare is simply not
  // listed, so that route is reached. Likewise its `keys`: a column the old
  // layout did not carry reads as unknown, which recomputes — never skips.
  route({
    source: "feed",
    table: row.t,
    op: row.op,
    ...scope,
  });
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
  route: (change: FeedChange) => void = routeChange,
): Promise<void> {
  const floorRow = await executeOne(db, {
    query: drizzleSql.raw(
      `SELECT min(position)::text AS min_position FROM ${LIVE_STATE_SNAPSHOT_TABLE}`,
    ),
    row: MinPositionRowSchema,
    label: "runCatchUp/snapshot-floor",
  });
  const minPosition = floorRow.min_position;
  if (minPosition === null) {
    // No persisted snapshots yet (first-ever boot) — nothing to catch up. The
    // boot-snapshot endpoint falls back to from-scratch loads, which persist.
    return;
  }

  // Oldest retained changelog row. If our floor is older than it, history was
  // pruned out from under a stale snapshot → FULL backstop below.
  const oldestRow = await executeOne(db, {
    query: drizzleSql.raw(
      `SELECT min(xid)::text AS min_xid FROM ${LIVE_STATE_CHANGELOG_TABLE}`,
    ),
    row: MinXidRowSchema,
    label: "runCatchUp/oldest-retained",
  });
  const oldestRetained = oldestRow.min_xid;

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

  const rows = await executeRows(db, {
    query: drizzleSql`
      SELECT xid::text AS xid, t, op, ids, keys, unchanged
      FROM ${drizzleSql.raw(LIVE_STATE_CHANGELOG_TABLE)}
      WHERE xid >= ${minPosition}::numeric
      ORDER BY seq
    `,
    row: ChangelogRowSchema,
    label: "runCatchUp/changelog-replay",
  });

  if (rows.length === 0) {
    log.publish(
      "[live-state-snapshot] catch-up: no changelog rows since floor — already current",
    );
    return;
  }

  log.publish(
    `[live-state-snapshot] catch-up: replaying ${rows.length} changelog row(s) since floor xid ${minPosition}`,
  );
  for (const row of rows) replayChange(row, route);
}

// FULL backstop: route a null-ids FULL change for every DISTINCT table seen in the
// retained changelog (the universe of tables that have changed). `applyDbChange`
// fans each out to every reading resource, so persisted resources whose tables
// changed get a FULL recompute. The rare, loud missing-history path.
async function fullRecomputeChangedTables(
  db: NodePgDatabase,
  route: (change: FeedChange) => void,
): Promise<void> {
  const changed = await executeRows(db, {
    query: drizzleSql.raw(
      `SELECT DISTINCT t FROM ${LIVE_STATE_CHANGELOG_TABLE}`,
    ),
    row: ChangedTableRowSchema,
    label: "fullRecomputeChangedTables",
  });
  for (const { t } of changed) {
    replayChange(
      { xid: "0", t, op: "U", ids: null, keys: null, unchanged: null },
      route,
    );
  }
}
