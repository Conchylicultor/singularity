import { sql } from "drizzle-orm";
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
  is(target, operand) {
    const want = asString(operand);
    if (want === "") return undefined;
    return sql`${target} = ${want}`;
  },
  "is-not"(target, operand) {
    const want = asString(operand);
    if (want === "") return undefined;
    return sql`(${target} IS NULL OR ${target} <> ${want})`;
  },
  "is-any-of"(target, operand) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    // Spelled out rather than `inArray(target, list)`, which does not accept an
    // `SQL` — that rejection is what keeps the operands off the column's
    // encoder. It renders exactly what drizzle renders: an array chunk becomes
    // `($1, $2)`, and the keyword is drizzle's own lowercase `" in "`. Its
    // empty-list branch (a literal `false`) was never reachable from here — an
    // empty list is short-circuited to `undefined` above.
    return sql`${target} in ${list}`;
  },
  "is-none-of"(target, operand) {
    const list = asList(operand);
    if (list.length === 0) return undefined;
    // `not in` alone drops null rows (NOT IN NULL → NULL); the JS predicate
    // keeps them, so OR the null branch back in.
    return sql`(${target} IS NULL OR ${target} not in ${list})`;
  },
  "is-empty"(target, _operand) {
    return sql`(${target} IS NULL OR ${target} = '')`;
  },
  "is-not-empty"(target, _operand) {
    return sql`(${target} IS NOT NULL AND ${target} <> '')`;
  },
} satisfies Record<string, FilterSqlBuilder>;
