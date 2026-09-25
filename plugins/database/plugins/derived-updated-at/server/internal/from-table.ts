import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { compileDerivedUpdatedAt } from "./compile";
import { registerDerivedUpdatedAt } from "./registry";
import type { DerivedUpdatedAtSpec, TouchRule } from "./types";

// ── The declaration, read off a drizzle table ───────────────────────────────
//
// `compileFromTable` is the ONE path from "a drizzle table + its touchedBy" to a
// compiled spec: it reads the physical column names and SQL types off the table,
// so a JS key renamed in the DB (`lastViewedAt` → `seen_at`) cannot drift from
// the trigger. `defineEntity` (infra/entities) calls it for an entity;
// `deriveUpdatedAt` wraps a raw `pgTable` with it.

/**
 * A TOTAL classification of every column of `T` but `updatedAt` itself, each
 * rule typed against its column's own select value — the raw-table twin of
 * entities' `TouchedBy`. A new column nobody classified is a tsc error.
 */
export type TableTouchedBy<T extends PgTable> = {
  [K in Exclude<keyof T["$inferSelect"], "updatedAt">]: TouchRule<
    T["$inferSelect"][K]
  >;
};

/** A drizzle table that has an `updatedAt` column — the only kind that can derive one. */
export type TableWithUpdatedAt = PgTable & {
  readonly $inferSelect: { readonly updatedAt: unknown };
};

type DrizzleColumn = { readonly name: string; getSQLType(): string };

/**
 * Compile `table`'s derived-`updatedAt` trigger from `touchedBy`, keyed by the
 * table's JS column keys. Does not register it.
 *
 * Runtime-checks what the types promise (for callers typed against a widened
 * record): the table has an `updatedAt` column, and `touchedBy` classifies every
 * other column exactly once. `where` prefixes that totality error so it names
 * the declaration site (default `deriveUpdatedAt("<table>"): touchedBy`).
 */
export function compileFromTable(
  table: PgTable,
  touchedBy: Readonly<Record<string, TouchRule<unknown>>>,
  where?: string,
): DerivedUpdatedAtSpec {
  const name = getTableName(table);
  const schema = getTableConfig(table).schema;
  if (schema !== undefined) {
    throw new Error(
      `derived updatedAt on "${name}": the table is in schema "${schema}"; ` +
        `only public-schema tables are supported.`,
    );
  }
  const columns = getTableColumns(table) as Record<string, DrizzleColumn>;
  const updatedAt = columns.updatedAt;
  if (!updatedAt) {
    throw new Error(
      `derived updatedAt on "${name}": the table has no updatedAt column.`,
    );
  }
  const expected = Object.keys(columns).filter((k) => k !== "updatedAt");
  const missing = expected.filter((k) => !(k in touchedBy));
  const extra = Object.keys(touchedBy).filter((k) => !expected.includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${where ?? `deriveUpdatedAt("${name}"): touchedBy`} must classify ` +
        `every column but updatedAt exactly once` +
        (missing.length > 0 ? `; missing: ${missing.join(", ")}` : "") +
        (extra.length > 0 ? `; not a column: ${extra.join(", ")}` : "") +
        `.`,
    );
  }
  return compileDerivedUpdatedAt({
    table: name,
    updatedAtColumn: updatedAt.name,
    columns: expected.map((key) => {
      const col = columns[key] as DrizzleColumn;
      return {
        key,
        name: col.name,
        sqlType: col.getSQLType(),
        rule: touchedBy[key] as TouchRule<unknown>,
      };
    }),
  });
}

/**
 * Declare how a raw drizzle table's `updatedAt` moves: compiles `touchedBy` into
 * the table's BEFORE UPDATE trigger, registers it for the boot installer (at
 * module eval, like `defineEntity`), and returns the table unchanged — so the
 * declaration wraps the `pgTable(…)` it describes:
 *
 *   export const agents = deriveUpdatedAt(pgTable("agents", { … }), {
 *     touchedBy: { name: true, …, id: false, createdAt: false },
 *   });
 */
export function deriveUpdatedAt<T extends TableWithUpdatedAt>(
  table: T,
  declaration: { readonly touchedBy: TableTouchedBy<T> },
): T {
  registerDerivedUpdatedAt(
    compileFromTable(
      table,
      declaration.touchedBy as Readonly<Record<string, TouchRule<unknown>>>,
    ),
  );
  return table;
}
