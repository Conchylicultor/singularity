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
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_key, params_key)
);
`;

export async function ensureSnapshotTable(db: NodePgDatabase): Promise<void> {
  await db.execute(drizzleSql.raw(SNAPSHOT_TABLE_DDL));
}
