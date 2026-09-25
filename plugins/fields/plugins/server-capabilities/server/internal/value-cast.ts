import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { FieldType } from "@plugins/fields/core";
import type { FilterDomainId } from "@plugins/network/plugins/live/plugins/filter/core";

/** Presents the raw TEXT storage column as the correctly-typed column for a
 *  field type — the SQL expression a server-delegated DataView interpolates into
 *  filter predicates AND ORDER BY / keyset seek. Default = identity (string
 *  types, e.g. text/enum, contribute nothing). Overrides: number `(c)::numeric`,
 *  bool `(c)::boolean`, date `(c)::timestamptz`. */
export type ValueTextCast = (rawCol: AnyColumn) => SQL;

export interface FieldValueTextCastContribution {
  type: FieldType;
  cast: ValueTextCast;
  /**
   * The filter-language domain the CAST expression is filtered in — the type
   * the cast produces (`::numeric` → `number`, `::timestamptz` → `instant`).
   * Declared beside the cast because it is a fact about the cast: a type with
   * no cast is read as its raw TEXT, i.e. the `text` domain.
   */
  domain: FilterDomainId;
}

/** Per-type text→typed SQL cast registry. Read at REQUEST time (inside a server
 *  route) only, so a plain live-registry lookup suffices — no eager pre-collect
 *  index like `Storage` (which resolves at module-eval inside `defineEntity`). */
export const ValueTextCast =
  defineServerContribution<FieldValueTextCastContribution>(
    "fields.value-text-cast",
    { docLabel: (p) => p.type.id },
  );

/** How a field type's TEXT-stored value reads as SQL: its cast and the domain
 *  that cast is filtered in. */
export interface FieldValueTextRead {
  cast: ValueTextCast | undefined;
  domain: FilterDomainId;
}

/** Resolve a field type's text→typed read by exact token (no `extends`
 *  fallback). Live registry only; a type that contributes no cast (a string
 *  type) reads its raw TEXT, in the `text` domain. */
export function resolveFieldValueTextCast(typeId: string): FieldValueTextRead {
  const c = ValueTextCast.getContributions().find((x) => x.type.id === typeId);
  return c
    ? { cast: c.cast, domain: c.domain }
    : { cast: undefined, domain: "text" };
}
