import {
  defineServerContribution,
  type ServerContributionToken,
} from "@plugins/framework/plugins/server-core/core";
import type { SQL } from "drizzle-orm";
import type { FieldType } from "@plugins/fields/core";
import { Fields as StorageFields } from "./storage";
import { ValueTextCast } from "./value-cast";

/** Builds a SQL predicate fragment for one (field-type, operator) pair, or
 *  `undefined` when the operand is INCOMPLETE (no-op rule → dropped),
 *  reproducing each web predicate's "empty operand ⇒ keep all" rule.
 *
 *  `target` is the field's column rendered as a plain SQL **expression** — not
 *  the column object — because a comparison operand is not a stored value. A
 *  real column is a drizzle `DriverValueEncoder`, and every drizzle helper binds
 *  its operand through the column it compares against (`bindIfParam(value, col)`
 *  → `new Param(value, col)`), which runs the column's WRITE-side schema: on a
 *  strict decoded column that throws `SqlColumnError` and 500s the whole query,
 *  and on a tolerant one it silently NORMALIZES the operand, so the surface
 *  answers a question the user did not ask. An `SQL` is not an encoder, so an
 *  operand compared against a target stays an ordinary param. The rendered
 *  statement is unchanged either way — only the encoder differs. See
 *  `research/2026-08-27-global-filter-operand-domain.md`.
 *
 *  A builder binds its own operands as drizzle params (never interpolated — no
 *  injection), and must not read column metadata (`col.name`, `col.enumValues`,
 *  …); none does. */
export type FilterSqlBuilder = (
  target: SQL,
  operand: unknown,
) => SQL | undefined;

export interface FieldFilterSqlContribution {
  type: FieldType;
  /** Operator id (matching the web `FilterOperatorSet`) → SQL fragment builder. */
  operators: Record<string, FilterSqlBuilder>;
}

// Eager, additive index of every field-type's operator map, populated the instant
// a `Fields.FilterSql(...)` contribution is DECLARED (barrel module-eval). Mirrors
// the storage carve-out exactly — a fallback consulted AFTER the live registry so
// it stays available in the pre-`collectContributions` windows. The capability
// barrels are pulled in eagerly by the `fields/server-capabilities-loader`
// plugin's `eager.generated` manifest, so every operator map self-registers here
// at eval.
const eager = new Map<string, Record<string, FilterSqlBuilder>>();

const filterSqlToken = defineServerContribution<FieldFilterSqlContribution>(
  "fields.filter-sql",
  { docLabel: (p) => p.type.id },
);

// Wrap the raw token so declaring a contribution self-registers into the eager
// index (the token call alone never touches the live registry). `getContributions`
// is carried through so the live-first resolver still reads the collected registry.
const FilterSqlToken = Object.assign(
  (props: FieldFilterSqlContribution) => {
    eager.set(props.type.id, props.operators);
    return filterSqlToken(props);
  },
  { getContributions: filterSqlToken.getContributions },
) as unknown as ServerContributionToken<FieldFilterSqlContribution>;

/** The server-owned field capability namespace. `Storage` is composed in from
 *  `./storage` and `ValueTextCast` from `./value-cast`, so this library
 *  re-exports ONE `Fields` object carrying every server-owned field capability
 *  (`Fields.Storage` + `Fields.FilterSql` + `Fields.ValueTextCast`) — the barrel
 *  itself stays pure (a plain re-export, no merge logic). */
export const Fields = {
  ...StorageFields,
  FilterSql: FilterSqlToken,
  ValueTextCast,
};

/** Resolve a (field type, operator) pair to its SQL fragment builder by exact
 *  token (no `extends` fallback — derived types re-declare). Live-first so a
 *  test that registers a throwaway type via `collectContributions` still wins;
 *  falls back to the eager self-registered index for codegen / boot windows. */
export function resolveFieldFilterSql(
  typeId: string,
  operatorId: string,
): FilterSqlBuilder | undefined {
  const live = Fields.FilterSql.getContributions().find(
    (c) => c.type.id === typeId,
  )?.operators;
  const operators = live ?? eager.get(typeId);
  return operators?.[operatorId];
}
