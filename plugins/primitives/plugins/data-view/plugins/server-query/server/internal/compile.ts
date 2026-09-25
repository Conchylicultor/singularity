import { sql, type SQL } from "drizzle-orm";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  decodeFilter,
  FilterError,
  type Filter,
  type Filterable,
  type FilterColumn,
  type FilterDomainId,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { filterSql } from "@plugins/network/plugins/live/plugins/filter/server";
import type { KeysetColumnBinding } from "@plugins/primitives/plugins/keyset/server";

/**
 * Binds one filterable/sortable column to its SQL — a physical column, or an
 * expression standing in for one (`ColumnExpr`, from the keyset binding).
 * `domain` is the filter-language domain the column is filtered in; `nullable`
 * (also from the keyset binding) drives null-aware keyset seek terms (default
 * `false`).
 */
export interface ColumnBinding extends KeysetColumnBinding {
  domain: FilterDomainId;
}

/**
 * Column id → binding. The ids a filter may name are exactly this map's keys:
 * a filter naming anything else throws — nothing is dropped.
 */
export type FieldColumnMap = Record<string, ColumnBinding>;

/**
 * Bind a source's declared `filterable` columns (its `core/` declaration, the
 * same object its web `ServerDataSourceSpec.filterable` carries) to their SQL.
 * Each binding's `domain` is COPIED from the declaration, so the two cannot
 * disagree, and a declared column with no binding is a `tsc` error.
 */
export function bindColumns<F extends Filterable>(
  filterable: F,
  columns: { readonly [K in keyof F & string]: KeysetColumnBinding },
): { [K in keyof F & string]: ColumnBinding } {
  const out = {} as { [K in keyof F & string]: ColumnBinding };
  for (const id of Object.keys(filterable) as (keyof F & string)[]) {
    const binding = columns[id];
    out[id] = { ...binding, domain: filterable[id]!.domain };
  }
  return out;
}

/** The declaration a column map implies: every bound column, in its domain. */
export function filterableOf(map: FieldColumnMap): Filterable {
  const out: Record<string, FilterColumn> = {};
  for (const [id, binding] of Object.entries(map)) {
    out[id] = { domain: binding.domain };
  }
  return out;
}

/**
 * The column as the plain expression a filter op compares against — never the
 * column object: a comparison operand is not a stored value, and a drizzle
 * column is an encoder that would run its WRITE-side schema over every bound
 * operand (see this plugin's CLAUDE.md).
 *
 * A `text`-domain target is relabelled `::text`, so a text op reads the same
 * over a `uuid`, `varchar` or Postgres-enum column as over a `text` one (the
 * language binds its operands `::text`, and `uuid = text` has no operator). On a
 * `text` column the cast is a no-op relabel the planner sees through.
 */
function comparisonTarget(binding: ColumnBinding): SQL {
  return binding.domain === "text"
    ? sql`(${binding.col})::text`
    : sql`${binding.col}`;
}

/**
 * Compile a (decoded) filter-language `Filter` → one SQL predicate, or
 * `undefined` for the absent filter (the caller omits the `WHERE` fragment).
 * A column the map does not bind THROWS: the handler decodes the body strictly
 * against the same map first (`decodeFilterBody`), so reaching here with an
 * unknown column is a bug, never a request to ignore.
 */
export function compileWhere(
  filter: Filter | undefined,
  map: FieldColumnMap,
): SQL | undefined {
  if (filter === undefined) return undefined;
  const targets: Record<string, SQL> = {};
  for (const [id, binding] of Object.entries(map)) {
    targets[id] = comparisonTarget(binding);
  }
  return filterSql(filter, targets, filterableOf(map));
}

/**
 * The wire `filter` of a server-delegated query body → its decoded `Filter`
 * (`undefined` when the body carries none). STRICT: the body must hold the
 * canonical tree of a filter over `filterable` exactly — an unknown column, a
 * wrong-domain op, a bad operand, a bound exceeded or a non-canonical spelling
 * is a 400 naming the problem, never a rule quietly dropped.
 */
export function decodeFilterBody(
  raw: unknown,
  filterable: Filterable,
): Filter | undefined {
  if (raw === undefined) return undefined;
  try {
    return decodeFilter(JSON.stringify(raw), filterable);
  } catch (err) {
    if (err instanceof FilterError) throw new HttpError(400, err.message);
    throw err;
  }
}
