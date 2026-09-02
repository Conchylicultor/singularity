import { createHash } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { DERIVED_TABLE_STATE_TABLE } from "@plugins/database/plugins/derived-views/core";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import { z } from "zod";
import { DerivedTable } from "./contribution";

const log = defineLogSink({
  id: "derived-tables",
  description:
    "Derived-tables rebuild ops log: rollup table/function/trigger DDL and the boot reconcile from source.",
});

// Rebuilds the trigger-maintained materialized rollup layer on every boot.
//
// A rollup spec has TWO HALVES WITH DIFFERENT NATURES, and this file treats them
// differently on purpose:
//
//   DEFINITION — `createDdl` + `functionDdl` + `triggerDdl`. Output IS the
//   definition: recreate a table/function/trigger from the same text and you get
//   the same object. So a content signature can license skipping it, exactly as
//   it does for `rebuildDerivedViews` and the change-feed's `rebuildTriggers`.
//
//   REPAIR — `reconcileDdl`. Output depends on source DATA, so NO definition
//   signature can license skipping it. It runs unconditionally, every boot.
//
// WHY THE DEFINITION HALF IS SKIPPED WHEN UNCHANGED. `triggerDdl` is a
// `DROP TRIGGER` + `CREATE TRIGGER` on the SOURCE table (`conversations`,
// `pushes`), which takes an AccessExclusive lock on it until commit. That lock is
// the real cost: during a hot-swap the previous backend is still reading those
// tables, and a short-lived `exec`-mode process (server-core's second boot mode)
// boots precisely while a backend is up and busy. This is the same argument, and
// the same fix, that `rebuildDerivedViews` documents for its own DROP+CREATE.
//
// WHY THE RECONCILE IS NOT SKIPPED — do not "optimize" this later. A rollup holds
// ROWS and can drift from its source with its definition byte-identical:
//   - `TRUNCATE` on a source fires NONE of the three AFTER INSERT/UPDATE/DELETE
//     statement triggers (no AFTER TRUNCATE trigger is declared), leaving every
//     rollup row stale and signalling nothing.
//   - Each spec carries a "why source-table-only triggers suffice" completeness
//     argument resting on application-level invariants (an immutable `attempt_id`,
//     a patch shape with no reparenting field) — and each then states that the
//     boot reconcile is the safety net REGARDLESS of that assumption. Skipping the
//     reconcile would promote reasoning its own authors declined to rely on into
//     load-bearing, and a TS-side change could violate it without moving a byte of
//     rollup SQL.
//   - The reconcile is documented as the self-heal for drift from downtime and
//     bulk loads.
// A definition signature observes none of that. The reconcile is a scan
// (`INSERT … SELECT` + `DELETE` against the rollup), not a lock on a hot source
// table, so leaving it unconditional costs startup time and blocks nothing.
//
// `db` is passed in (like `runMigrations`) so this module never imports
// `@plugins/database/server` — that would form a cycle (database/server calls us).
export async function rebuildDerivedTables(db: NodePgDatabase): Promise<void> {
  // Rollups are declared via the `DerivedTable` server contribution on each
  // owning plugin's definition. The framework collects all contributions before
  // any onReadyBlocking runs, so this list is complete regardless of import order.
  const specs = DerivedTable.getContributions();
  if (specs.length === 0) return;

  // Content signature of the rollup layer's DEFINITION ONLY. `reconcileDdl` is
  // deliberately excluded: it runs every boot regardless, so folding it in would
  // force a needless DDL rerun (and its lock window) whenever only the reconcile
  // SQL changed.
  const signature = createHash("sha256")
    .update(
      specs
        .map(
          (s) =>
            `${s.table}\n${s.createDdl}\n${s.functionDdl}\n${s.triggerDdl}`,
        )
        .join("\n--\n"),
    )
    .digest("hex");

  await db.transaction(async (tx) => {
    // Bookkeeping for the rollup layer's definition signature. Created
    // idempotently here (not via a migration) because, like the rollups it
    // tracks, it is derived-layer state — not schema in the migration chain. It
    // lives in the DB so a worktree fork carries the signature with its rollups
    // (a `CREATE DATABASE … TEMPLATE` copies the row), avoiding a spurious
    // first-boot DDL pass on the fork.
    //
    // `DERIVED_TABLE_STATE_TABLE` MUST appear literally on the CREATE TABLE line
    // (the imperative-create-table-allowlisted check enforces this).
    await tx.execute(
      drizzleSql.raw(
        `CREATE TABLE IF NOT EXISTS "public"."${DERIVED_TABLE_STATE_TABLE}" (
           id boolean PRIMARY KEY DEFAULT true CHECK (id),
           signature text NOT NULL
         )`,
      ),
    );

    // No row on the very first boot of a database — a legitimately-empty result,
    // which is why this reads rows rather than demanding exactly one.
    const priorRows = await executeRows(tx, {
      query: drizzleSql.raw(
        `SELECT signature FROM "public"."${DERIVED_TABLE_STATE_TABLE}" LIMIT 1`,
      ),
      row: z.object({ signature: z.string() }),
      label: "derived-tables: read signature",
    });
    const prior = priorRows[0]?.signature;

    // Guard against a rollup table dropped out-of-band: only trust the signature
    // when every declared rollup also physically exists. (The generic layer knows
    // each spec's TABLE but not the trigger names inside its opaque SQL, so this
    // cannot prove the triggers are present. It does not need to: the reconcile
    // below is unconditional, so a rollup left stale by a missing trigger is
    // repaired on this boot and every boot after it.)
    const existingRows = await executeRows(tx, {
      query: drizzleSql.raw(
        `SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      ),
      row: z.object({ table_name: z.string() }),
      label: "derived-tables: list existing tables",
    });
    const existing = new Set(existingRows.map((r) => r.table_name));
    const allPresent = specs.every((s) => existing.has(s.table));

    if (prior === signature && allPresent) {
      log.publish(
        `[derived-tables] definitions up to date (${specs.length} rollup(s), signature unchanged) — skipping DDL`,
      );
      return;
    }

    log.publish(
      `[derived-tables] rebuilding ${specs.length} rollup definition(s): ${specs
        .map((s) => s.table)
        .join(", ")}`,
    );

    for (const spec of specs) {
      await tx.execute(drizzleSql.raw(spec.createDdl));
      await tx.execute(drizzleSql.raw(spec.functionDdl));
      await tx.execute(drizzleSql.raw(spec.triggerDdl));
    }

    await tx.execute(
      drizzleSql`
        INSERT INTO "public".${drizzleSql.raw(`"${DERIVED_TABLE_STATE_TABLE}"`)} (id, signature)
        VALUES (true, ${signature})
        ON CONFLICT (id) DO UPDATE SET signature = EXCLUDED.signature
      `,
    );
  });

  // UNCONDITIONAL — see the header. Runs after the definition transaction has
  // committed, so table + function + triggers exist (the order each spec's
  // `reconcileDdl` documents). Each spec's reconcile is its own statement, and
  // each is internally guarded (`to_regclass(...) IS NOT NULL`) so a
  // pre-migration fresh-DB boot no-ops instead of erroring.
  for (const spec of specs) {
    await db.execute(drizzleSql.raw(spec.reconcileDdl));
  }

  log.publish(
    `[derived-tables] reconciled ${specs.length} rollup(s) from source: ${specs
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
