import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { FieldType } from "@plugins/fields/core";

/** Presents the raw TEXT storage column as the correctly-typed column for a
 *  field type — the SQL expression a server-delegated DataView interpolates into
 *  filter predicates AND ORDER BY / keyset seek (sort never flows through
 *  `FilterSql`, hence a distinct capability). Default = identity (string types,
 *  e.g. text/enum, contribute nothing). Overrides: number `(c)::numeric`, bool
 *  `(c)::boolean`, date `(c)::timestamptz`. */
export type ValueTextCast = (rawCol: AnyColumn) => SQL;

export interface FieldValueTextCastContribution {
  type: FieldType;
  cast: ValueTextCast;
}

/** Per-type text→typed SQL cast registry. Read at REQUEST time (inside a server
 *  route) only, so a plain live-registry lookup suffices — no eager pre-collect
 *  index like `Storage` / `FilterSql` (those resolve at module-eval inside
 *  `defineEntity`). */
export const ValueTextCast =
  defineServerContribution<FieldValueTextCastContribution>(
    "fields.value-text-cast",
    { docLabel: (p) => p.type.id },
  );

/** Resolve a field type's text→typed SQL cast by exact token (no `extends`
 *  fallback — matches `resolveFieldFilterSql`). Live registry only; returns
 *  `undefined` for string types that contribute no cast (identity). */
export function resolveFieldValueTextCast(
  typeId: string,
): ValueTextCast | undefined {
  return ValueTextCast.getContributions().find((c) => c.type.id === typeId)
    ?.cast;
}
