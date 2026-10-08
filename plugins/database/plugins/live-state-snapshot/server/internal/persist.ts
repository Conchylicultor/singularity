import { sql as drizzleSql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  executeOne,
  executeRows,
} from "@plugins/database/plugins/sql-rows/core";
import {
  Resource,
  removeReadSetTable,
} from "@plugins/framework/plugins/server-core/core";
import type { PersistMeta } from "@plugins/framework/plugins/server-core/core";
import { LIVE_STATE_SNAPSHOT_TABLE } from "@plugins/database/plugins/derived-views/core";
import { emitReadSetShrink } from "./read-set-shrink-hook";

// The set of resource keys L2 persists: preloaded (with ONE default tuple) AND
// DB-backed. `preload` is read GENERICALLY from the shared Resource.Declare
// collection (never by naming a resource — collection-consumer separation), like
// boot-snapshot's `preloadedKeys`. An ENUMERATED preload (a parameterized value
// whose Declare carries `preloadTuples`) is excluded: an L2 row is one
// param-less tuple per key, so its N tuples cannot be persisted, and a boot
// recompute at `{}` (below, for a key with no persisted read-set) would name a
// tuple it does not have. The `!externalSource` half is enforced in the
// runtime's `drainEntry` (it has the live `entry.externalSource`); the injected
// `shouldPersist` only needs the preload membership test. The contribution set is
// fixed at module load, so caching it once is correct.
let preloadedSet: Set<string> | null = null;
export function preloadedKeys(): Set<string> {
  if (!preloadedSet) {
    preloadedSet = new Set(
      Resource.Declare.getContributions()
        .filter((c) => c.preload !== undefined && c.preloadTuples === undefined)
        .map((c) => c.key),
    );
  }
  return preloadedSet;
}

export function shouldPersist(key: string): boolean {
  return preloadedKeys().has(key);
}

/**
 * What a USABLE L2 row must match (A18 as a read predicate, C22, C23) — the
 * runtime's own answer, passed to every read: the keys it persists right now
 * (`persistedKeys()` — a bounded or external key's leftover row is never
 * served) and each one's definition (`persistedDefinitions()`; a key absent
 * from the map expects NULL).
 */
export interface L2Expectation {
  persisted: readonly string[];
  definitions: Readonly<Record<string, string>>;
}

// A JS string list as ONE Postgres text[] value. Drizzle expands a JS array in
// a `sql` template into a comma-separated list of bound params — not an array
// — so the constructor is spelled out; an empty list is `ARRAY[]::text[]`.
function textArray(values: readonly string[]): SQL {
  return drizzleSql`ARRAY[${drizzleSql.join(
    values.map((v) => drizzleSql`${v}`),
    drizzleSql`, `,
  )}]::text[]`;
}

/**
 * The usable-row predicate every L2 read applies (§4.2): the key is persisted
 * now, the row was written under the running definition, and by a writer that
 * knew the `definition_at` column — an older backend's upsert (a hot swap)
 * moves `persisted_at` but not `definition_at`, so the row it leaves
 * invalidates itself rather than carrying the new definition over an old value.
 */
export function usableRowSql(exp: L2Expectation): SQL {
  return drizzleSql`(
    resource_key = ANY(${textArray(exp.persisted)})
    AND definition IS NOT DISTINCT FROM (${JSON.stringify(exp.definitions)}::jsonb ->> resource_key)
    AND definition_at IS NOT DISTINCT FROM persisted_at
  )`;
}

// The query's `::text` cast is what makes this a plain `text` column, so the
// watermark stays a string end to end and never passes through a JS number near
// 2^63 (see the comment on the function below).
const WatermarkRowSchema = z.object({ xmin: z.string() });

// The durable monotonic position: the xmin of the CURRENT snapshot, in the 64-bit
// xid8 family (never the 32-bit txid_* forms — wraparound hole). Read-only, so it
// does not force an xid assignment. Captured BEFORE the loader's first read by the
// runtime, so the catch-up replay predicate (xid >= position) can never
// under-replay a write invisible to the loader's snapshot. Returned as text →
// stored as numeric (no signed-bigint overflow near 2^63).
export async function captureWatermark(db: NodePgDatabase): Promise<string> {
  // A `SELECT` with no `FROM` returns exactly one row, so `executeOne` carries the
  // "no row" throw this used to spell out by hand.
  const row = await executeOne(db, {
    query: drizzleSql.raw(
      `SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS xmin`,
    ),
    row: WatermarkRowSchema,
    label: "captureWatermark",
  });
  return row.xmin;
}

// `tables_read` is a real `text[]` (see tables-ddl.ts), which pg DOES decode to a
// JS `string[]` — unlike the `name[]` an uncast `array_agg` over a catalog column
// produces. `old_tables` is the pre-upsert value, absent on a first INSERT.
const ReadSetDiffRowSchema = z.object({
  old_tables: z.array(z.string()).nullable(),
  new_tables: z.array(z.string()),
});

// Persist a value under (resource_key, params_key) — the runtime's persist hook,
// called only on a whole value (never a loader's failure path) and serialized
// per (key, params). `meta.mode` (see `PersistMeta`):
//
//  - `replace` — a FULL recompute: value, position (the flight's watermark),
//    `position_at`, `tables_read` (`meta.guardTables`, the run's read-set,
//    written atomically with the value it describes) and the definition are all
//    replaced. Also reads its own pre-upsert `tables_read` back (a
//    data-modifying CTE) to detect a read-set SHED and emit it on the
//    read-set-shrink seam — pure observability, a synchronous in-memory hand-off
//    that never throws into the persist path;
//  - `floor` — a persisted alias's snapshot after scoped refills: the value, and
//    the position only ever LOWERED to the snapshot's base floor (`LEAST`); its
//    `position_at` and `tables_read` are kept, because neither a replace nor a
//    read-set describes it. A missing row — or one this writer could not use
//    (another definition's, or an older writer's) — gets the floor, a NULL
//    `position_at` (the compact job then targets it) and `meta.guardTables`.
//
// Both write the definition and stamp `definition_at` with the same `now()` as
// `persisted_at`, which is what makes the row usable (`usableRowSql`). `value`
// binds as one jsonb param.
export async function persistSnapshot(
  db: NodePgDatabase,
  key: string,
  paramsKey: string,
  value: unknown,
  watermark: string,
  meta: PersistMeta,
): Promise<void> {
  const table = drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE);
  const tablesArray = textArray(meta.guardTables);
  if (meta.mode === "floor") {
    // The stored row was not usable for THIS writer: another definition wrote
    // it (a hot swap), or a writer that predates `definition_at` upserted it
    // (C22). Its `tables_read` and `position_at` describe someone else's
    // replace, so the floor write treats it as a missing row — the guard
    // tables and a NULL `position_at` (the compact job replaces it) — rather
    // than re-validating foreign metadata under this definition. (Inside DO
    // UPDATE, `s.*` is the row as it was before this statement.)
    const foreignRow = drizzleSql`(
      s.definition IS DISTINCT FROM EXCLUDED.definition
      OR s.definition_at IS DISTINCT FROM s.persisted_at
    )`;
    await db.execute(drizzleSql`
      INSERT INTO ${table} AS s
        (resource_key, params_key, value, position, tables_read, persisted_at,
         position_at, definition, definition_at)
      VALUES (
        ${key},
        ${paramsKey},
        ${JSON.stringify(value)}::jsonb,
        ${watermark}::numeric,
        ${tablesArray},
        now(),
        NULL,
        ${meta.definition}::text,
        now()
      )
      ON CONFLICT (resource_key, params_key) DO UPDATE
        SET value = EXCLUDED.value,
            position = LEAST(s.position, EXCLUDED.position),
            tables_read = CASE WHEN ${foreignRow}
              THEN EXCLUDED.tables_read ELSE s.tables_read END,
            position_at = CASE WHEN ${foreignRow}
              THEN NULL ELSE s.position_at END,
            persisted_at = EXCLUDED.persisted_at,
            definition = EXCLUDED.definition,
            definition_at = EXCLUDED.definition_at
    `);
    return;
  }
  // Single-statement upsert that ALSO returns the PRE-upsert `tables_read` (the
  // `prev` SELECT sees the row as of statement start, before the ON CONFLICT
  // update takes effect) alongside the freshly-written set — a SHED with zero
  // extra round-trip. On a first INSERT `prev` is empty → old_tables is NULL →
  // "no shed".
  const rows = await executeRows(db, {
    query: drizzleSql`
      WITH prev AS (
        SELECT tables_read AS old_tables
        FROM ${table}
        WHERE resource_key = ${key} AND params_key = ${paramsKey}
      )
      INSERT INTO ${table}
        (resource_key, params_key, value, position, tables_read, persisted_at,
         position_at, definition, definition_at)
      VALUES (
        ${key},
        ${paramsKey},
        ${JSON.stringify(value)}::jsonb,
        ${watermark}::numeric,
        ${tablesArray},
        now(),
        now(),
        ${meta.definition}::text,
        now()
      )
      ON CONFLICT (resource_key, params_key) DO UPDATE
        SET value = EXCLUDED.value,
            position = EXCLUDED.position,
            tables_read = EXCLUDED.tables_read,
            persisted_at = EXCLUDED.persisted_at,
            position_at = EXCLUDED.position_at,
            definition = EXCLUDED.definition,
            definition_at = EXCLUDED.definition_at
      RETURNING
        (SELECT old_tables FROM prev) AS old_tables,
        tables_read AS new_tables
    `,
    row: ReadSetDiffRowSchema,
    label: "persistSnapshot",
  });
  // Read-set shrink detection: every persisted resource is boot-critical, so a
  // dropped dependency in its durable read-set is the ambiguous shed described in
  // research/2026-07-08-global-read-set-shrink-guard.md — safe if a code change
  // removed the dependency, unsafe if a data-dependent conditional query didn't
  // fire. Indistinguishable here, so we SURFACE it (debug/read-set-shrink monitor)
  // for human confirmation instead of changing behaviour. Emit is a pure in-memory
  // hand-off (no I/O, never throws on the persist path).
  const row = rows[0];
  if (row?.old_tables) {
    const newSet = new Set(row.new_tables);
    const dropped = row.old_tables.filter((t) => !newSet.has(t));
    if (dropped.length > 0) {
      emitReadSetShrink({
        resourceKey: key,
        droppedTables: dropped,
        oldTables: row.old_tables,
        newTables: row.new_tables,
      });
    }
  }
}

const PersistedReadSetRowSchema = z.object({
  resource_key: z.string(),
  tables_read: z.array(z.string()),
});

// Read the persisted read-sets of the USABLE param-less ("{}") rows in ONE
// query, for the boot seed and the onReady usable check. Returns resource_key →
// string[] (the pg driver returns a text[] column as a JS string[]). A key with
// no usable row, or an empty `tables_read`, is "no usable read-set" — the caller
// (boot init) force-FULL recomputes it.
export async function readPersistedReadSets(
  db: NodePgDatabase,
  exp: L2Expectation,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const rows = await executeRows(db, {
    query: drizzleSql`
      SELECT resource_key, tables_read
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}' AND ${usableRowSql(exp)}
    `,
    row: PersistedReadSetRowSchema,
    label: "readPersistedReadSets",
  });
  // No `?? []` fallback: `tables_read` is `NOT NULL DEFAULT '{}'`, so an empty
  // read-set already arrives as `[]` — which IS the "no usable read-set" signal.
  for (const row of rows) out.set(row.resource_key, row.tables_read);
  return out;
}

// `RETURNING resource_key` — the three row-counting mutations below share it.
const ResourceKeyRowSchema = z.object({ resource_key: z.string() });

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
  const changed = await executeRows(db, {
    query: drizzleSql`
      UPDATE ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
        SET tables_read = array_remove(tables_read, ${table})
      WHERE resource_key <> ALL(${keepArray})
        AND ${table} = ANY(tables_read)
      RETURNING resource_key
    `,
    row: ResourceKeyRowSchema,
    label: "reconcileReadSetTable",
  });
  // Mirror the removal into the live in-memory index so `_debug` is corrected
  // immediately (no restart wait). Returns the keys it changed — ignored here.
  removeReadSetTable(table, keepKeys);
  return changed.length;
}

// `value` is the loader's own output round-tripped through `jsonb` — genuinely
// caller-shaped, so `z.unknown()` is the honest assertion and the only one.
// `position` is cast to text (an xid8-family numeric near 2^63 must never pass
// through a JS number); `position_at_ms` is epoch milliseconds, NULL until a
// replace persist wrote the row.
const PersistedSnapshotRowSchema = z.object({
  resource_key: z.string(),
  value: z.unknown(),
  position: z.string(),
  position_at_ms: z.number().nullable(),
});

/** One usable persisted row: its value, its catch-up floor, and when a replace last set it. */
export interface PersistedSnapshotRow {
  value: unknown;
  position: string;
  /** `position_at` in epoch ms; null when no replace persist ever wrote the row. */
  positionAt: number | null;
}

// Read the USABLE persisted param-less ("{}") rows for the given resource keys
// in ONE query — the boot snapshot's L2 fast path and the boot seed. A key with
// no usable row is simply absent (the caller falls back to a from-scratch load).
export async function readPersistedSnapshots(
  db: NodePgDatabase,
  keys: readonly string[],
  exp: L2Expectation,
): Promise<Map<string, PersistedSnapshotRow>> {
  const out = new Map<string, PersistedSnapshotRow>();
  if (keys.length === 0) return out;
  const rows = await executeRows(db, {
    query: drizzleSql`
      SELECT resource_key, value, position::text AS position,
             (extract(epoch FROM position_at) * 1000)::float8 AS position_at_ms
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND resource_key = ANY(${textArray(keys)})
        AND ${usableRowSql(exp)}
    `,
    row: PersistedSnapshotRowSchema,
    label: "readPersistedSnapshots",
  });
  for (const row of rows) {
    out.set(row.resource_key, {
      value: row.value,
      position: row.position,
      positionAt: row.position_at_ms,
    });
  }
  return out;
}

// The compact job's targets: every persisted key WITHOUT a usable row whose
// `position_at` is within the last hour — a missing row, an unusable one, and a
// NULL `position_at` (a row only floor persists ever wrote) all count. Their
// FULL recompute replaces the row, so the global catch-up floor (and the
// changelog prune pinned to it) advances at least hourly.
export async function compactTargets(
  db: NodePgDatabase,
  exp: L2Expectation,
): Promise<string[]> {
  if (exp.persisted.length === 0) return [];
  const fresh = await executeRows(db, {
    query: drizzleSql`
      SELECT resource_key
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND ${usableRowSql(exp)}
        AND position_at >= now() - interval '1 hour'
    `,
    row: ResourceKeyRowSchema,
    label: "compactTargets",
  });
  const freshKeys = new Set(fresh.map((r) => r.resource_key));
  return exp.persisted.filter((k) => !freshKeys.has(k));
}

// Boot sweep: DELETE every row that is not USABLE (`usableRowSql`), returning the
// number removed. That evicts a row for a key that is no longer persisted — one
// migrated to the bounded working-set contract (window / point, which the
// runtime NEVER persists), an external one, or one whose `preload` was dropped
// — and a row a different definition or an older writer left. Served via the
// L2 boot fast path, such a leftover would hydrate the client with a stale,
// possibly-unbounded value under a key whose loader now returns something
// else; every read refuses it anyway (the predicate), so the sweep is cleanup.
// Rows for keys that don't exist at all are swept too. An empty persisted set
// is a no-op guard (never nuke everything): at a real boot it is non-empty, and
// persistence is a graceful-degradation accelerator anyway. Not scoped to
// `params_key = '{}'` — only `{}` rows are ever usable. `RETURNING` makes the
// count robust regardless of the driver's `rowCount` typing.
export async function sweepUnusableSnapshots(
  db: NodePgDatabase,
  exp: L2Expectation,
): Promise<number> {
  if (exp.persisted.length === 0) return 0;
  const removed = await executeRows(db, {
    query: drizzleSql`
      DELETE FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE NOT (params_key = '{}' AND ${usableRowSql(exp)})
      RETURNING resource_key
    `,
    row: ResourceKeyRowSchema,
    label: "sweepUnusableSnapshots",
  });
  return removed.length;
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
  const removed = await executeRows(db, {
    query: drizzleSql`
      DELETE FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND resource_key IN (${drizzleSql.join(keys, drizzleSql`, `)})
      RETURNING resource_key
    `,
    row: ResourceKeyRowSchema,
    label: "clearPersistedSnapshots",
  });
  return removed.length;
}
