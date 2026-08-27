import { sql } from "drizzle-orm";
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
  contains(target, operand) {
    const q = asText(operand);
    if (q === "") return undefined;
    return sql`${target} ILIKE ${`%${escapeLike(q)}%`}`;
  },
  "does-not-contain"(target, operand) {
    const q = asText(operand);
    if (q === "") return undefined;
    // Keep null rows: a null projection reads as "" in JS, which does not
    // contain a non-empty needle → the JS predicate keeps it.
    return sql`(${target} IS NULL OR ${target} NOT ILIKE ${`%${escapeLike(q)}%`})`;
  },
  is(target, operand) {
    const q = asText(operand);
    if (q === "") return undefined;
    return sql`lower(${target}) = lower(${q})`;
  },
  "is-not"(target, operand) {
    const q = asText(operand);
    if (q === "") return undefined;
    // Keep null rows (JS: "" !== q is true for a non-empty q).
    return sql`(${target} IS NULL OR lower(${target}) <> lower(${q}))`;
  },
  "is-empty"(target, _operand) {
    return sql`(${target} IS NULL OR ${target} ~ ${WHITESPACE_ONLY})`;
  },
  "is-not-empty"(target, _operand) {
    return sql`(${target} IS NOT NULL AND ${target} !~ ${WHITESPACE_ONLY})`;
  },
} satisfies Record<string, FilterSqlBuilder>;
