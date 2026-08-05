import { or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * SQL twin of `tags/filter`'s array-aware predicates
 * (`web/internal/tags-filter-logic.ts`), over a `jsonb` string array
 * (`tags/plugins/storage`). Truth-table parity:
 *  - empty operand (`""` scalar, `[]` list) → incomplete rule → `undefined`
 *    (matches the JS predicates' permissive "keep every row" on empty);
 *  - the JS side reads a missing value as `[]`, so the operators that say *true*
 *    for `[]` must KEEP null rows: `NULL @> x` is NULL (row dropped), not false,
 *    so `does-not-contain` ORs the null branch back in exactly as `enum`'s
 *    `is-not` does, and `is-empty` gets it from `tagArray`'s NULL → `[]` case;
 *  - `contains` / `contains-any-of` / `contains-all-of` deliberately use the
 *    BARE column: `NULL @> x` ⇒ NULL ⇒ row excluded, which is already what the
 *    JS predicate says, and wrapping the column in COALESCE would make a GIN
 *    index on it unusable. Emptiness cannot use an index either way, so it pays
 *    for the `jsonb_typeof` guard instead (see `tagArray`).
 *
 * Operands are bound as drizzle params (a JSON text param + a `::jsonb` cast),
 * never string-spliced.
 */

/** The row's tag set as jsonb, projecting SQL NULL **and any non-array value**
 *  to `[]` — the SQL twin of the JS `Array.isArray(v) ? v : []`. Load-bearing:
 *  `jsonb_array_length` RAISES on a non-array, so an emptiness predicate over a
 *  corrupt row would 500 the whole query rather than skip the row. */
function tagArray(col: AnyColumn): SQL {
  return sql`(CASE WHEN jsonb_typeof(${col}) = 'array' THEN ${col} ELSE '[]'::jsonb END)`;
}

/** `col @> [<tags>]` — jsonb containment is SUPERSET semantics, so one
 *  fragment covers "has every tag in the list". */
function containsAll(col: AnyColumn, tags: string[]): SQL {
  return sql`${col} @> ${JSON.stringify(tags)}::jsonb`;
}

function asString(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

function asList(operand: unknown): string[] {
  return Array.isArray(operand)
    ? operand.filter((x): x is string => typeof x === "string")
    : [];
}

export const tagsFilterSql = {
  contains(col: AnyColumn, operand: unknown) {
    const tag = asString(operand);
    if (tag === "") return undefined;
    return containsAll(col, [tag]);
  },
  "does-not-contain"(col: AnyColumn, operand: unknown) {
    const tag = asString(operand);
    if (tag === "") return undefined;
    // The JS predicate reads a missing value as `[]`, which does not contain
    // the tag ⇒ true. `NOT (NULL @> x)` is NULL, so keep the null branch.
    return sql`(${col} IS NULL OR NOT (${containsAll(col, [tag])}))`;
  },
  "contains-any-of"(col: AnyColumn, operand: unknown) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    // No single-operator "intersects" for jsonb (`?|` is text-key only and
    // conflicts with the driver's placeholder) — OR one containment per tag.
    return or(...list.map((tag) => containsAll(col, [tag])));
  },
  "contains-all-of"(col: AnyColumn, operand: unknown) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    return containsAll(col, list);
  },
  "is-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`jsonb_array_length(${tagArray(col)}) = 0`;
  },
  "is-not-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`jsonb_array_length(${tagArray(col)}) > 0`;
  },
} satisfies Record<string, FilterSqlBuilder>;
