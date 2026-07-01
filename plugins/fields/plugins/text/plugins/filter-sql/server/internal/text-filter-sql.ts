import { sql, type AnyColumn } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";

/**
 * SQL twin of `text/filter`'s case-insensitive substring predicates
 * (`web/internal/text-filter-logic.ts`). Each builder reproduces that predicate
 * truth table EXACTLY:
 *  - an empty operand (`asText(operand) === ""`) is an incomplete rule → the
 *    builder returns `undefined` so the consumer drops the fragment (keep all);
 *  - the negative ops (`does-not-contain`, `is-not`) KEEP null rows, mirroring
 *    JS where a null projection reads as `""` and so fails `contains`/equals.
 *  - emptiness is whitespace-trimmed (`String.trim()`), so a whitespace-only
 *    value counts as empty.
 */

/** The operand as a string, or "" when absent/empty (mirrors `asText`). */
function asText(operand: unknown): string {
  return typeof operand === "string" ? operand : "";
}

/** Escape LIKE/ILIKE metacharacters so the operand matches literally.
 *  Postgres' default LIKE escape character is the backslash. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** A value that is null or whitespace-only — the SQL twin of `.trim() === ""`. */
const WHITESPACE_ONLY = "^[[:space:]]*$";

export const textFilterSql = {
  contains(col: AnyColumn, operand: unknown) {
    const q = asText(operand);
    if (q === "") return undefined;
    return sql`${col} ILIKE ${`%${escapeLike(q)}%`}`;
  },
  "does-not-contain"(col: AnyColumn, operand: unknown) {
    const q = asText(operand);
    if (q === "") return undefined;
    // Keep null rows: a null projection reads as "" in JS, which does not
    // contain a non-empty needle → the JS predicate keeps it.
    return sql`(${col} IS NULL OR ${col} NOT ILIKE ${`%${escapeLike(q)}%`})`;
  },
  is(col: AnyColumn, operand: unknown) {
    const q = asText(operand);
    if (q === "") return undefined;
    return sql`lower(${col}) = lower(${q})`;
  },
  "is-not"(col: AnyColumn, operand: unknown) {
    const q = asText(operand);
    if (q === "") return undefined;
    // Keep null rows (JS: "" !== q is true for a non-empty q).
    return sql`(${col} IS NULL OR lower(${col}) <> lower(${q}))`;
  },
  "is-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`(${col} IS NULL OR ${col} ~ ${WHITESPACE_ONLY})`;
  },
  "is-not-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`(${col} IS NOT NULL AND ${col} !~ ${WHITESPACE_ONLY})`;
  },
} satisfies Record<string, FilterSqlBuilder>;
