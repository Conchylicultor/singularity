import { and, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { FilterSqlBuilder } from "@plugins/fields/plugins/server-capabilities/server";
import {
  addUnits,
  resolveAnchorDay,
  withinRange,
  type DateRange,
} from "@plugins/fields/plugins/date/plugins/filter/core";

/**
 * SQL twin of `date/filter`'s day-granular predicates
 * (`web/internal/date-filter-logic.ts`). The operand resolution reuses the
 * lifted, browser-safe anchor math (`resolveAnchorDay` / `addUnits` /
 * `withinRange`) byte-for-byte, so the JS and SQL paths agree on which calendar
 * day every anchor names.
 *
 * The column is a `timestamptz`; each day-comparison compiles to a half-open
 * range `col >= <day-start> AND col < <next-day-start>`. A day boundary is a
 * start-of-(local)-day epoch ms (from the anchor math) converted to a timestamp
 * via `to_timestamp(ms / 1000.0)`.
 *
 * Parity notes:
 *  - empty/invalid operand → incomplete rule → `undefined`;
 *  - a null column is EXCLUDED by every comparison op (SQL NULL comparison ≠
 *    TRUE), matching JS where a null projection returns `false`.
 *
 * TIMEZONE FIDELITY (v1 gap, documented in
 * research/2026-06-28-global-conversations-dataview-server-query.md): the
 * anchor math resolves "start of day" against the SERVER process clock/TZ,
 * whereas the web predicate uses the BROWSER's local day. For a server and
 * client in different timezones the half-open day window can be offset by the
 * TZ delta. v1 accepts this; a future revision can thread the client TZ offset
 * through the query body. Do not over-engineer it here.
 */

/** Start-of-day epoch ms → a `timestamptz` bound param via `to_timestamp`. */
function dayTs(ms: number): SQL {
  return sql`to_timestamp(${ms} / 1000.0)`;
}

/** The day AFTER the given start-of-day, calendar-safe (DST-correct). */
function nextDay(ms: number): number {
  return addUnits(ms, "day", 1);
}

export const dateFilterSql = {
  is(col: AnyColumn, operand: unknown) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    return sql`(${col} >= ${dayTs(b)} AND ${col} < ${dayTs(nextDay(b))})`;
  },
  "is-before"(col: AnyColumn, operand: unknown) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) < b  ⟺  col < start-of-day(b)
    return sql`${col} < ${dayTs(b)}`;
  },
  "is-after"(col: AnyColumn, operand: unknown) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) > b  ⟺  col >= start-of-next-day(b)
    return sql`${col} >= ${dayTs(nextDay(b))}`;
  },
  "is-on-or-before"(col: AnyColumn, operand: unknown) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) <= b  ⟺  col < start-of-next-day(b)
    return sql`${col} < ${dayTs(nextDay(b))}`;
  },
  "is-on-or-after"(col: AnyColumn, operand: unknown) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) >= b  ⟺  col >= start-of-day(b)
    return sql`${col} >= ${dayTs(b)}`;
  },
  "is-between"(col: AnyColumn, operand: unknown) {
    const range = (operand ?? {}) as DateRange;
    const from = resolveAnchorDay(range.from);
    const to = resolveAnchorDay(range.to);
    if (from === null && to === null) return undefined;
    const parts: SQL[] = [];
    if (from !== null) parts.push(sql`${col} >= ${dayTs(from)}`);
    // `to` is inclusive of the whole day → strictly before the next day.
    if (to !== null) parts.push(sql`${col} < ${dayTs(nextDay(to))}`);
    return and(...parts);
  },
  "is-within-past"(col: AnyColumn, operand: unknown) {
    return within(col, operand, "past");
  },
  "is-within-next"(col: AnyColumn, operand: unknown) {
    return within(col, operand, "next");
  },
  "is-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`${col} IS NULL`;
  },
  "is-not-empty"(col: AnyColumn, _operand?: unknown) {
    return sql`${col} IS NOT NULL`;
  },
} satisfies Record<string, FilterSqlBuilder>;

function within(
  col: AnyColumn,
  operand: unknown,
  direction: "past" | "next",
): SQL | undefined {
  const range = withinRange(operand, direction);
  if (range === null) return undefined;
  const [lo, hi] = range;
  // [lo, hi] inclusive of the whole `hi` day → half-open [lo, hi + 1 day).
  return sql`(${col} >= ${dayTs(lo)} AND ${col} < ${dayTs(nextDay(hi))})`;
}
