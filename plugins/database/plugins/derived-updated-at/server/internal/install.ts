import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { escapeLiteral } from "pg";
import { z } from "zod";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { quoteIdent } from "./compile";
import { registeredDerivedUpdatedAt } from "./registry";
import type { DerivedUpdatedAtSpec } from "./types";

// ── Installing the derived-`updatedAt` triggers ─────────────────────────────
//
// Follows the superseded-trigger precedent
// (`plugins/infra/plugins/jobs/server/internal/superseded-trigger.ts`):
//   - the spec's sha256 signature is stored as the trigger's COMMENT, so "is it
//     already installed as written?" is a catalog-only read that takes no lock
//     on the table (compared instead of `pg_get_triggerdef`, which is Postgres's
//     normalisation of what we wrote). A trigger dropped out of band takes its
//     signature with it; a disabled one counts as out of date. It survives the
//     dump/restore worktree fork, so a fresh fork boots with nothing to do.
//   - only a missing / changed trigger runs DDL, one transaction per table,
//     serialized by a transaction-scoped advisory lock and re-checked under it,
//     so two backends booting against one database never both run it.
// `CREATE OR REPLACE TRIGGER` takes SHARE ROW EXCLUSIVE (blocking writers for
// one statement), never ACCESS EXCLUSIVE.
//
// `db` is passed in (like `runMigrations` / `rebuildDerivedTables`) because the
// database plugin calls this — importing its barrel here would cycle.

type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
type Exec = NodePgDatabase | Tx;

const StateRow = z.object({
  table_exists: z.boolean(),
  signature: z.string().nullable(),
  enabled: z.boolean().nullable(),
  function_present: z.boolean(),
});

type State = "up-to-date" | "stale";

async function readState(
  exec: Exec,
  spec: DerivedUpdatedAtSpec,
): Promise<State> {
  const rel = escapeLiteral(quoteIdent(spec.table));
  const fn = escapeLiteral(`${quoteIdent(spec.triggerName)}()`);
  const rows = await executeRows(exec, {
    query: sql.raw(
      `SELECT to_regclass(${rel}) IS NOT NULL                        AS table_exists,
              obj_description(t.oid, 'pg_trigger')                   AS signature,
              t.tgenabled = 'O'                                      AS enabled,
              to_regprocedure(${fn}) IS NOT NULL                     AS function_present
         FROM (SELECT 1) one
         LEFT JOIN pg_trigger t
           ON t.tgrelid = to_regclass(${rel}) AND t.tgname = ${escapeLiteral(spec.triggerName)}`,
    ),
    row: StateRow,
    label: `derived-updated-at: state of ${spec.table}`,
  });
  const row = rows[0];
  if (!row) {
    throw new Error(
      `derived updatedAt: catalog read for "${spec.table}" returned no row.`,
    );
  }
  if (!row.table_exists) {
    throw new Error(
      `derived updatedAt: table "${spec.table}" does not exist — ` +
        `installDerivedUpdatedAt must run after migrations.`,
    );
  }
  return row.signature === spec.signature &&
    row.enabled === true &&
    row.function_present
    ? "up-to-date"
    : "stale";
}

async function installOne(
  db: NodePgDatabase,
  spec: DerivedUpdatedAtSpec,
): Promise<"installed" | "unchanged"> {
  if ((await readState(db, spec)) === "up-to-date") return "unchanged";
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('derived_updated_at'), hashtext(${spec.table}))`,
    );
    if ((await readState(tx, spec)) === "up-to-date") return "unchanged";
    await tx.execute(sql.raw(spec.functionDdl));
    await tx.execute(sql.raw(spec.triggerDdl));
    await tx.execute(
      sql.raw(
        `COMMENT ON TRIGGER ${quoteIdent(spec.triggerName)} ON ${quoteIdent(spec.table)} IS ${escapeLiteral(spec.signature)}`,
      ),
    );
    return "installed";
  });
}

export interface DerivedUpdatedAtInstall {
  readonly table: string;
  readonly outcome: "installed" | "unchanged";
}

/**
 * Install (or leave alone, when already current) the derived-`updatedAt`
 * trigger of every entity whose `meta.updatedAt` declares `touchedBy` — or of
 * exactly `specs`, when given (a test installing only its own entity's trigger
 * into a throwaway database). Must run after migrations: every table must exist.
 *
 * Then asserts every trigger is present with its expected signature, and
 * throws if one is not — a boot never proceeds with an underived `updatedAt`.
 */
export async function installDerivedUpdatedAt(
  db: NodePgDatabase,
  specs: readonly DerivedUpdatedAtSpec[] = registeredDerivedUpdatedAt(),
): Promise<readonly DerivedUpdatedAtInstall[]> {
  const results: DerivedUpdatedAtInstall[] = [];
  for (const spec of specs) {
    results.push({ table: spec.table, outcome: await installOne(db, spec) });
  }
  const missing: string[] = [];
  for (const spec of specs) {
    if ((await readState(db, spec)) !== "up-to-date") missing.push(spec.table);
  }
  if (missing.length > 0) {
    throw new Error(
      `derived updatedAt: trigger missing or out of date after install on: ` +
        `${missing.join(", ")}.`,
    );
  }
  return results;
}
