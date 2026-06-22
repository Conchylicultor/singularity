import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { LIVE_STATE_SNAPSHOT_TABLE } from "@plugins/database/plugins/derived-views/core";

// `live_state_snapshot` — the persisted materialized value. One row per
// (resource_key, params_key); `params_key = "{}"` for the param-less
// boot-critical resources L2 v1 covers. `value` is the FULL loader output (same
// granularity as the snapshot endpoint). `position` is the xmin watermark
// captured BEFORE the value's reads (the 64-bit xid8 family, stored as numeric).
//
// Created via CREATE TABLE IF NOT EXISTS on boot — derived state, NOT a drizzle
// migration (same pattern as __singularity_derived_view_state). The changelog
// table is created by change-feed inside its trigger-rebuild txn (it writes it
// from the trigger function); the snapshot table is owned here because only the
// runtime persist hook and the boot read touch it. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.2.
const SNAPSHOT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${LIVE_STATE_SNAPSHOT_TABLE} (
  resource_key text    NOT NULL,
  params_key   text    NOT NULL,
  value        jsonb   NOT NULL,
  position     numeric NOT NULL,
  tables_read  text[]  NOT NULL DEFAULT '{}'::text[],
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_key, params_key)
);
`;

// Idempotent in-place upgrade for snapshot tables created before `tables_read`
// existed: pre-existing rows get the `'{}'` default (treated as "no usable
// read-set" → force-FULL once on the next boot, which re-persists the real
// read-set). Derived DDL, NOT a drizzle migration — same pattern as the CREATE.
const SNAPSHOT_TABLE_ADD_TABLES_READ = `
ALTER TABLE ${LIVE_STATE_SNAPSHOT_TABLE}
  ADD COLUMN IF NOT EXISTS tables_read text[] NOT NULL DEFAULT '{}'::text[];
`;

export async function ensureSnapshotTable(db: NodePgDatabase): Promise<void> {
  await db.execute(drizzleSql.raw(SNAPSHOT_TABLE_DDL));
  await db.execute(drizzleSql.raw(SNAPSHOT_TABLE_ADD_TABLES_READ));
}
