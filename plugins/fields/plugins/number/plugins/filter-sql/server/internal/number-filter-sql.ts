import { and, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * SQL twin of `number/filter`'s comparison predicates
 * (`web/internal/number-filter-logic.ts`). Truth-table parity:
 *  - empty operand (non-finite / absent) → incomplete rule → `undefined`;
 *  - a null/absent column value is EXCLUDED by every operator (JS returns
 *    `false` when the field projection is null), which falls out naturally:
 *    every comparison against SQL NULL yields NULL (≠ TRUE), so the row drops —
 *    including `≠`, unlike text's `is-not`.
 *  - `between` open bounds: a missing min or max leaves that side unbounded.
 */

/** The operand as a finite number, or null when absent/non-numeric. */
function asNumber(operand: unknown): number | null {
  if (typeof operand === "number" && Number.isFinite(operand)) return operand;
  return null;
}

/** A binary comparison op: empty operand → undefined (incomplete rule). */
function binary(
  render: (col: AnyColumn, b: number) => SQL,
): FilterSqlBuilder {
  return (col, operand) => {
    const b = asNumber(operand);
    if (b === null) return undefined;
    return render(col, b);
  };
}

interface NumberRange {
  min?: number;
  max?: number;
}

export const numberFilterSql = {
  "=": binary((col, b) => sql`${col} = ${b}`),
  "≠": binary((col, b) => sql`${col} <> ${b}`),
  ">": binary((col, b) => sql`${col} > ${b}`),
  "<": binary((col, b) => sql`${col} < ${b}`),
  "≥": binary((col, b) => sql`${col} >= ${b}`),
  "≤": binary((col, b) => sql`${col} <= ${b}`),
  between(col: AnyColumn, operand: unknown) {
    const range = (operand ?? {}) as NumberRange;
    const min = asNumber(range.min);
    const max = asNumber(range.max);
    if (min === null && max === null) return undefined;
    const parts: SQL[] = [];
    if (min !== null) parts.push(sql`${col} >= ${min}`);
    if (max !== null) parts.push(sql`${col} <= ${max}`);
    return and(...parts);
  },
  "is-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`${col} IS NULL`;
  },
  "is-not-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`${col} IS NOT NULL`;
  },
} satisfies Record<string, FilterSqlBuilder>;
