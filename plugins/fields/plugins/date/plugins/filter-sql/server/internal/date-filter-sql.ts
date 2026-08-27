import { and, sql, type SQL } from "drizzle-orm";
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
  is(target, operand) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    return sql`(${target} >= ${dayTs(b)} AND ${target} < ${dayTs(nextDay(b))})`;
  },
  "is-before"(target, operand) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) < b  ⟺  col < start-of-day(b)
    return sql`${target} < ${dayTs(b)}`;
  },
  "is-after"(target, operand) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) > b  ⟺  col >= start-of-next-day(b)
    return sql`${target} >= ${dayTs(nextDay(b))}`;
  },
  "is-on-or-before"(target, operand) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) <= b  ⟺  col < start-of-next-day(b)
    return sql`${target} < ${dayTs(nextDay(b))}`;
  },
  "is-on-or-after"(target, operand) {
    const b = resolveAnchorDay(operand);
    if (b === null) return undefined;
    // day(col) >= b  ⟺  col >= start-of-day(b)
    return sql`${target} >= ${dayTs(b)}`;
  },
  "is-between"(target, operand) {
    const range = (operand ?? {}) as DateRange;
    const from = resolveAnchorDay(range.from);
    const to = resolveAnchorDay(range.to);
    if (from === null && to === null) return undefined;
    const parts: SQL[] = [];
    if (from !== null) parts.push(sql`${target} >= ${dayTs(from)}`);
    // `to` is inclusive of the whole day → strictly before the next day.
    if (to !== null) parts.push(sql`${target} < ${dayTs(nextDay(to))}`);
    return and(...parts);
  },
  "is-within-past"(target, operand) {
    return within(target, operand, "past");
  },
  "is-within-next"(target, operand) {
    return within(target, operand, "next");
  },
  "is-empty"(target, _operand) {
    return sql`${target} IS NULL`;
  },
  "is-not-empty"(target, _operand) {
    return sql`${target} IS NOT NULL`;
  },
} satisfies Record<string, FilterSqlBuilder>;

function within(
  col: SQL,
  operand: unknown,
  direction: "past" | "next",
): SQL | undefined {
  const range = withinRange(operand, direction);
  if (range === null) return undefined;
  const [lo, hi] = range;
  // [lo, hi] inclusive of the whole `hi` day → half-open [lo, hi + 1 day).
  return sql`(${col} >= ${dayTs(lo)} AND ${col} < ${dayTs(nextDay(hi))})`;
}
