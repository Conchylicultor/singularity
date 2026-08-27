import { sql } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * SQL twin of `bool/filter`'s yes/no predicates
 * (`web/internal/bool-filter-logic.ts`). Both operators are ALWAYS complete —
 * an absent operand reads as `false` ("Unchecked") and a null column reads as
 * `false` (`Boolean(null)`), so these builders never return `undefined` and a
 * null row is folded into the `false` bucket via `COALESCE(col, false)`.
 */

/** The operand as a boolean (defaults to false when unset). */
function asBool(operand: unknown): boolean {
  return operand === true;
}

export const boolFilterSql = {
  is(target, operand) {
    return sql`COALESCE(${target}, false) = ${asBool(operand)}`;
  },
  "is-not"(target, operand) {
    return sql`COALESCE(${target}, false) <> ${asBool(operand)}`;
  },
} satisfies Record<string, FilterSqlBuilder>;
