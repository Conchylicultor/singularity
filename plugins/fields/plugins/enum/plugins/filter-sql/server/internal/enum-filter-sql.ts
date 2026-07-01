import { inArray, notInArray, sql, type AnyColumn } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * SQL twin of `enum/filter`'s single-/multi-select predicates
 * (`web/internal/enum-filter-logic.ts`). Comparison is case-SENSITIVE exact
 * equality (unlike text). Truth-table parity:
 *  - empty operand (`""` scalar, `[]` list) → incomplete rule → `undefined`;
 *  - the negative ops (`is-not`, `is-none-of`) KEEP null rows (JS projects null
 *    to "" which is `!== want` / not in the list);
 *  - emptiness covers both SQL NULL and the empty string.
 */

function asString(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

function asList(operand: unknown): string[] {
  return Array.isArray(operand)
    ? operand.filter((x): x is string => typeof x === "string")
    : [];
}

export const enumFilterSql = {
  is(col: AnyColumn, operand: unknown) {
    const want = asString(operand);
    if (want === "") return undefined;
    return sql`${col} = ${want}`;
  },
  "is-not"(col: AnyColumn, operand: unknown) {
    const want = asString(operand);
    if (want === "") return undefined;
    return sql`(${col} IS NULL OR ${col} <> ${want})`;
  },
  "is-any-of"(col: AnyColumn, operand: unknown) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    return inArray(col, list);
  },
  "is-none-of"(col: AnyColumn, operand: unknown) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    // `notInArray` alone drops null rows (NOT IN NULL → NULL); the JS predicate
    // keeps them, so OR the null branch back in.
    return sql`(${col} IS NULL OR ${notInArray(col, list)})`;
  },
  "is-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`(${col} IS NULL OR ${col} = '')`;
  },
  "is-not-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`(${col} IS NOT NULL AND ${col} <> '')`;
  },
} satisfies Record<string, FilterSqlBuilder>;
