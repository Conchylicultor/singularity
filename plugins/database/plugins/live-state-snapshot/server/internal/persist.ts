import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { Resource } from "@plugins/framework/plugins/server-core/core";
import { LIVE_STATE_SNAPSHOT_TABLE } from "@plugins/database/plugins/derived-views/core";

// The set of resource keys L2 persists: boot-critical AND DB-backed. `bootCritical`
// is read GENERICALLY from the shared Resource.Declare collection (never by naming
// a resource — collection-consumer separation), exactly like
// boot-snapshot's `bootCriticalKeys`. The `!externalSource` half is enforced in
// the runtime's `drainEntry` (it has the live `entry.externalSource`); the
// injected `shouldPersist` only needs the boot-critical membership test. The
// contribution set is fixed at module load, so caching it once is correct.
let bootCriticalSet: Set<string> | null = null;
function bootCriticalKeys(): Set<string> {
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
export async function captureWatermark(): Promise<string> {
  const res = await db.execute<{ xmin: string }>(
    drizzleSql.raw(`SELECT pg_snapshot_xmin(pg_current_snapshot())::text AS xmin`),
  );
  const xmin = res.rows[0]?.xmin;
  if (xmin === undefined) {
    throw new Error("captureWatermark: pg_snapshot_xmin returned no row");
  }
  return xmin;
}

// Persist the FULL value under (resource_key, params_key) with its watermark.
// Called by the runtime only on loader success. `value` is serialized to jsonb via
// the parameter binding (drizzle passes a JS object as a json param).
export async function persistSnapshot(
  key: string,
  paramsKey: string,
  value: unknown,
  watermark: string,
): Promise<void> {
  await db.execute(
    drizzleSql`
      INSERT INTO ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
        (resource_key, params_key, value, position, updated_at)
      VALUES (
        ${key},
        ${paramsKey},
        ${JSON.stringify(value)}::jsonb,
        ${watermark}::numeric,
        now()
      )
      ON CONFLICT (resource_key, params_key) DO UPDATE
        SET value = EXCLUDED.value,
            position = EXCLUDED.position,
            updated_at = EXCLUDED.updated_at
    `,
  );
}

// Read the persisted param-less ("{}") values for the given resource keys in ONE
// query, for the boot-snapshot hot path. Returns a key→value map; a key with no
// persisted row is simply absent (the caller falls back to a from-scratch load).
export async function readPersistedSnapshots(
  keys: string[],
): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (keys.length === 0) return out;
  const res = await db.execute<{ resource_key: string; value: unknown }>(
    drizzleSql`
      SELECT resource_key, value
      FROM ${drizzleSql.raw(LIVE_STATE_SNAPSHOT_TABLE)}
      WHERE params_key = '{}'
        AND resource_key = ANY(${keys})
    `,
  );
  for (const row of res.rows) out.set(row.resource_key, row.value);
  return out;
}
