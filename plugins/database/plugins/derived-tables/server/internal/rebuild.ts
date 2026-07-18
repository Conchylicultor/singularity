import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import { DerivedTable } from "./contribution";

const log = defineLogSink({
  id: "derived-tables",
  description:
    "Derived-tables rebuild ops log: materialized rollup (hand-rolled IVM) rebuilds on boot.",
});

// Rebuilds the entire trigger-maintained materialized-rollup layer from source.
//
// Each rollup is DERIVED state (recomputable from its source tables), so the
// table is created idempotently (CREATE TABLE IF NOT EXISTS), its maintenance
// function + triggers are recreated (CREATE OR REPLACE / DROP+CREATE), and a
// reconcile rebuilds its contents from source. This mirrors rebuildDerivedViews
// and rebuildTriggers — deterministic, data-less DDL, NOT a migration.
//
// `tx` is passed in (like rebuildDerivedViews / rebuildTriggers / runMigrations)
// so this module NEVER imports @plugins/database/server — that would cycle
// (database/server's boot calls into change-feed, which calls us). The CALLER
// runs us inside change-feed's `rebuildTriggers` transaction, AFTER the per-table
// trigger loop: at that point listPublicTables has already been snapshotted
// (before the txn), so the rollup table does not yet exist when the feed's
// trigger set is computed → no live_state NOTIFY trigger is ever installed on it
// (and feedExemptTables() merged into the DENYLIST keeps the post-txn coverage
// check from flagging it). See
// research/2026-06-23-global-agent-launches-incremental-materialization.md §7.
export async function rebuildDerivedTables(tx: NodePgDatabase): Promise<void> {
  // Rollups are declared via the `DerivedTable` server contribution on each
  // owning plugin's definition. The framework collects all contributions before
  // any onReadyBlocking runs, so this list is complete regardless of import order.
  const specs = DerivedTable.getContributions();
  if (specs.length === 0) return;

  for (const spec of specs) {
    await tx.execute(drizzleSql.raw(spec.createDdl));
    await tx.execute(drizzleSql.raw(spec.functionDdl));
    await tx.execute(drizzleSql.raw(spec.triggerDdl));
    await tx.execute(drizzleSql.raw(spec.reconcileDdl));
  }

  log.publish(
    `[derived-tables] rebuilt ${specs.length} rollup table(s): ${specs
      .map((s) => s.table)
      .join(", ")}`,
  );
}

// The set of rollup table names. The change-feed merges this into its trigger
// DENYLIST so no NOTIFY trigger is installed on a rollup (it is a pure
// read-cache fed by its source's change, never an independent write surface — a
// trigger on it would double-route the source change through the rollup's id
// space and defeat the correctly-scoped source-driven recompute). Complete at
// boot for the same reason rebuildDerivedTables is — contributions are
// collected before onReadyBlocking.
export function feedExemptTables(): Set<string> {
  return new Set(DerivedTable.getContributions().map((s) => s.table));
}
