import { sql as drizzleSql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Resource } from "@plugins/framework/plugins/server-core/core";
import { LIVE_STATE_SNAPSHOT_TABLE } from "@plugins/database/plugins/derived-views/core";
import { removeReadSetTable } from "@plugins/infra/plugins/runtime-profiler/core";

// The set of resource keys L2 persists: boot-critical AND DB-backed. `bootCritical`
// is read GENERICALLY from the shared Resource.Declare collection (never by naming
// a resource — collection-consumer separation), exactly like
// boot-snapshot's `bootCriticalKeys`. The `!externalSource` half is enforced in
// the runtime's `drainEntry` (it has the live `entry.externalSource`); the
// injected `shouldPersist` only needs the boot-critical membership test. The
// contribution set is fixed at module load, so caching it once is correct.
let bootCriticalSet: Set<string> | null = null;
export function bootCriticalKeys(): Set<string> {
  if (!bootCriticalSet) {
    bootCriticalSet = new Set(
      Resource.Declare.getContributions()
        .filter((c) => c.bootCritical)
        .map((c) => c.key),
    );
  }
  return bootCriticalSet;
}

export function shouldPersist(key: string): boolean {
  return bootCriticalKeys().has(key);
}

// The durable monotonic position: the xmin of the CURRENT snapshot, in the 64-bit
// xid8 family (never the 32-bit txid_* forms — wraparound hole). Read-only, so it
// does not force an xid assignment. Captured BEFORE the loader's first read by the
// runtime, so the catch-up replay predicate (xid >= position) can never
// under-replay a write invisible to the loader's snapshot. Returned as text →
// stored as numeric (no signed-bigint overflow near 2^63).
export async function captureWatermark(db: NodePgDatabase): Promise<string> {
  const res = await db.execute<{ xmin: string }>(
    drizzleSql.raw(`SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS xmin`),
  );
  const xmin = res.rows[0]?.xmin;
  if (xmin === undefined) {
    throw new Error("captureWatermark: pg_snapshot_xmin returned no row");
  }
  return xmin;
}

// Persist the FULL value under (resource_key, params_key) with its watermark and
// the per-resource read-set (the tables the loader read while computing `value`,
// written atomically with it so it is always consistent with the value it
// describes). Called by the runtime only on loader success. `value` is serialized
// to jsonb via the parameter binding (drizzle passes a JS object as a json param).
//
// `tablesRead` binds as a Postgres text[]: drizzle expands a JS array inside a
// `sql` template into a comma-separated list of bound params (NOT a single array
// value), so an `ARRAY[…]` constructor is built explicitly via `sql.join`. An
// empty array yields `ARRAY[]::text[]`, a valid empty text[] literal.
export async function persistSnapshot(
  db: NodePgDatabase,
  key: string,
  paramsKey: string,
  value: unknown,
  watermark: string,
  tablesRead: readonly string[],
): Promise<void> {
  const tablesArray = drizzleSql`ARRAY[${drizzleSql.join(
    tablesRead.map((t) => drizzleSql`${t}`),
    drizzleSql`, `,
  )}]::text[]`;
  await db.execute(
    drizzleSql`
      INSERT INTO ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
        (resource_key, params_key, value, position, tables_read, updated_at)
      VALUES (
        ${key},
        ${paramsKey},
        ${JSON.stringify(value)}::jsonb,
        ${watermark}::numeric,
        ${tablesArray},
        now()
      )
      ON CONFLICT (resource_key, params_key) DO UPDATE
        SET value = EXCLUDED.value,
            position = EXCLUDED.position,
            tables_read = EXCLUDED.tables_read,
            updated_at = EXCLUDED.updated_at
    `,
  );
}

// Read the persisted read-sets for the param-less ("{}") snapshots in ONE query,
// for the boot seed. Returns resource_key → string[] (the pg driver returns a
// text[] column as a JS string[]). A key with an empty `tables_read` is "no usable
// read-set" — the caller (boot init) force-FULL recomputes it.
export async function readPersistedReadSets(
  db: NodePgDatabase,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const res = await db.execute<{ resource_key: string; tables_read: string[] }>(
    drizzleSql`
      SELECT resource_key, tables_read
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
    `,
  );
  for (const row of res.rows) out.set(row.resource_key, row.tables_read ?? []);
  return out;
}

/**
 * Reconcile a single table out of the persisted read-set: remove `table` from
 * `tables_read` for every snapshot row whose `resource_key` is NOT in `keepKeys`,
 * and mirror the removal into the in-memory index (`removeReadSetTable`) so the
 * live `_debug` view is corrected without waiting for a restart. Used by a table's
 * owner to assert its reader-set invariant and evict a historical mis-attribution
 * (the read-set index is append-only + persisted + re-seeded, so a stale edge
 * otherwise survives forever). Safe: only drops edges to a table the resource does
 * not read. Returns the number of persisted rows changed.
 *
 * `keepKeys` binds as a Postgres text[] the same way `persistSnapshot` binds
 * `tables_read`: an explicit `ARRAY[…]::text[]` constructor (drizzle expands a JS
 * array into a comma-separated bound-param list, not a single array value). An
 * empty `keepKeys` yields `ARRAY[]::text[]`, and `resource_key <> ALL(ARRAY[]…)`
 * is vacuously true → the table is removed from every row. `RETURNING` makes the
 * changed-row count robust regardless of the driver's `rowCount` typing (matches
 * `clearPersistedSnapshots`).
 */
export async function reconcileReadSetTable(
  db: NodePgDatabase,
  table: string,
  keepKeys: readonly string[],
): Promise<number> {
  const keepArray = drizzleSql`ARRAY[${drizzleSql.join(
    keepKeys.map((k) => drizzleSql`${k}`),
    drizzleSql`, `,
  )}]::text[]`;
  const res = await db.execute<{ resource_key: string }>(
    drizzleSql`
      UPDATE ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
        SET tables_read = array_remove(tables_read, ${table})
      WHERE resource_key <> ALL(${keepArray})
        AND ${table} = ANY(tables_read)
      RETURNING resource_key
    `,
  );
  // Mirror the removal into the live in-memory index so `_debug` is corrected
  // immediately (no restart wait). Returns the keys it changed — ignored here.
  removeReadSetTable(table, keepKeys);
  return res.rows.length;
}

// Read the persisted param-less ("{}") values for the given resource keys in ONE
// query, for the boot-snapshot hot path. Returns a key→value map; a key with no
// persisted row is simply absent (the caller falls back to a from-scratch load).
export async function readPersistedSnapshots(
  db: NodePgDatabase,
  keys: string[],
): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (keys.length === 0) return out;
  // Drizzle expands a JS array inside a `sql` template into a comma-separated
  // list of bound params — correct for `IN (…)` but NOT for `ANY(…)` (which
  // needs a single array value, and otherwise raises "op ANY/ALL (array)
  // requires array on right side" → 500). Use the `IN` form so the expansion is
  // well-formed. The `keys.length === 0` early return above guarantees a
  // non-empty list.
  const res = await db.execute<{ resource_key: string; value: unknown }>(
    drizzleSql`
      SELECT resource_key, value
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND resource_key IN (${drizzleSql.join(keys, drizzleSql`, `)})
    `,
  );
  for (const row of res.rows) out.set(row.resource_key, row.value);
  return out;
}

// Cold-boot benchmark hook: DELETE the param-less ("{}") persisted rows for the
// given resource keys, returning the number of rows removed. Forces a truly cold
// boot-snapshot read on the next request (the L2 fast path misses → falls back to
// a from-scratch loader) WITHOUT a server restart. Lives here because this plugin
// OWNS `live_state_snapshot`; consumers (boot-bench) call it generically by key
// rather than issuing raw SQL against a table they don't own. `RETURNING` makes
// the deleted-row count robust regardless of the driver's `rowCount` typing.
export async function clearPersistedSnapshots(
  db: NodePgDatabase,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  const res = await db.execute<{ resource_key: string }>(
    drizzleSql`
      DELETE FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND resource_key IN (${drizzleSql.join(keys, drizzleSql`, `)})
      RETURNING resource_key
    `,
  );
  return res.rows.length;
}
