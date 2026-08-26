/**
 * The `date` field type's data-view bucketing strategies — pure, runtime-
 * agnostic (no DOM, no React), `bun:test`-able.
 *
 * Five groupings: **Smart** (relative to today, coarsening with distance — the
 * Gmail reading) and the four fixed granularities **Day / Week / Month /
 * Year**.
 *
 * **Everything here is the LOCAL calendar.** Every boundary goes through
 * `date-picker/core`'s day math (`startOfDay` / `startOfWeek` / `startOfMonth`
 * / `addDays` / `addMonths`), whose rule is `Date` setters and never epoch
 * arithmetic — so a DST transition shifts the *instant* while leaving the *day*
 * count correct. `t + 86_400_000` is the bug that module exists to make
 * unrepresentable, and it is exactly the bug that would put a spring-forward
 * evening in the wrong bucket here.
 *
 * **The clock is injected.** `ctx.now` is a required parameter, never a
 * `Date.now()` read inside a grouping — the same argument `relativeDayLabel`
 * already makes ("an implicit clock read is exactly what makes this kind of
 * function untestable"), plus a correctness one: the partition runs inside a
 * `useMemo`, so reading the clock would change the memo key on every render.
 *
 * **A value that cannot be bucketed answers `null`**, and data-view files that
 * row in the same "None" section as a genuinely null value. A `null`/`undefined`
 * never reaches a grouping at all (data-view routes it before consulting one),
 * so what `null` covers here is a *non-null* value that does not parse as a date
 * — a corrupt stored string, a boolean projected onto a date field. There is
 * deliberately no catch-all bucket of our own: a minted "None" would be a SECOND
 * section wearing that name, and its ordinal would have to sit outside the real
 * ones — last ascending, but first the moment the view's sort flipped.
 */

import type {
  FieldGrouping,
  FieldValue,
  GroupBucket,
  GroupingPlanContext,
} from "@plugins/primitives/plugins/data-view/core";
import {
  addDays,
  addMonths,
  isSameDay,
  monthTitle,
  normalizeWeekStart,
  relativeDayLabel,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toISODay,
} from "@plugins/primitives/plugins/date-picker/core";

/**
 * Weeks start on Monday. **The one line to change** for a Sunday-first week —
 * every week boundary in this file (Smart's `Later this week` / `Next week` /
 * `Earlier this week` / `Last week`, and the Week granularity itself) is
 * derived from it, so they can never disagree about where a week breaks.
 */
const WEEK_STARTS_ON = normalizeWeekStart(1);

/** What one grouping's `plan` returns: the bucket a value falls in, or `null`
 *  when the value is not a date this type can bucket. */
type Bucketer = (value: FieldValue) => GroupBucket | null;

/**
 * The fifteen Smart buckets, symmetric around today: past negative, today 0,
 * future positive. Disjoint and exhaustive over every instant; a bucket with no
 * rows simply never appears.
 */
const SMART = {
  older: { key: "older", label: "Older", order: -7 },
  earlierYear: { key: "earlier-year", label: "Earlier this year", order: -6 },
  lastMonth: { key: "last-month", label: "Last month", order: -5 },
  earlierMonth: {
    key: "earlier-month",
    label: "Earlier this month",
    order: -4,
  },
  lastWeek: { key: "last-week", label: "Last week", order: -3 },
  earlierWeek: { key: "earlier-week", label: "Earlier this week", order: -2 },
  yesterday: { key: "yesterday", label: "Yesterday", order: -1 },
  today: { key: "today", label: "Today", order: 0 },
  tomorrow: { key: "tomorrow", label: "Tomorrow", order: 1 },
  thisWeek: { key: "this-week", label: "Later this week", order: 2 },
  nextWeek: { key: "next-week", label: "Next week", order: 3 },
  thisMonth: { key: "this-month", label: "Later this month", order: 4 },
  nextMonth: { key: "next-month", label: "Next month", order: 5 },
  laterYear: { key: "later-year", label: "Later this year", order: 6 },
  later: { key: "later", label: "Later", order: 7 },
} as const satisfies Record<string, GroupBucket>;

/**
 * The field value as a `Date`, or `null` when it is not a date.
 *
 * The `null` is a **parse predicate**, not an absorbed failure: a projected
 * cell value is untrusted (it may come from a custom column's TEXT storage or
 * an unvalidated row), and "this is not a date" is a legitimate answer the
 * caller branches on — the grouping answers `null` for it.
 */
function toDate(value: FieldValue): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** Local midnight of the day `value` falls on, or `null` when it is not a date. */
function toDay(value: FieldValue): Date | null {
  const date = toDate(value);
  return date === null ? null : startOfDay(date);
}

/**
 * The absolute name of a day outside the ±1 relative window, e.g. "Wed, May 20"
 * — with the year appended only when it differs from the year being viewed
 * from, which is the only case where it carries information.
 */
function absoluteDayLabel(day: Date, today: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(day);
}

/** The name of a week, by its first day: "Week of May 11" (year when it differs). */
function weekLabel(weekStart: Date, today: Date, locale?: string): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(weekStart.getFullYear() === today.getFullYear()
      ? {}
      : { year: "numeric" }),
  }).format(weekStart);
  return `Week of ${formatted}`;
}

/**
 * Smart: how far from today, coarsening with distance.
 *
 * The ladder is ordered by **proximity, not by calendar containment** — the
 * nearer reading always wins. A date next Tuesday that happens to fall in the
 * next month is "Next week", not "Next month", because that is the more
 * informative of the two true statements.
 */
function planSmart(ctx: GroupingPlanContext): Bucketer {
  const today = startOfDay(new Date(ctx.now));
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const weekStart = startOfWeek(today, WEEK_STARTS_ON);
  const nextWeekStart = addDays(weekStart, 7);
  const weekAfterNextStart = addDays(weekStart, 14);
  const lastWeekStart = addDays(weekStart, -7);

  const monthStart = startOfMonth(today);
  const nextMonthStart = addMonths(monthStart, 1);
  const monthAfterNextStart = addMonths(monthStart, 2);
  const lastMonthStart = addMonths(monthStart, -1);

  const yearStart = new Date(today.getFullYear(), 0, 1);
  const nextYearStart = new Date(today.getFullYear() + 1, 0, 1);

  return (value) => {
    const day = toDay(value);
    if (day === null) return null;

    if (isSameDay(day, today)) return SMART.today;
    if (isSameDay(day, tomorrow)) return SMART.tomorrow;
    if (isSameDay(day, yesterday)) return SMART.yesterday;

    const ms = day.getTime();
    if (ms > today.getTime()) {
      if (ms < nextWeekStart.getTime()) return SMART.thisWeek;
      if (ms < weekAfterNextStart.getTime()) return SMART.nextWeek;
      if (ms < nextMonthStart.getTime()) return SMART.thisMonth;
      if (ms < monthAfterNextStart.getTime()) return SMART.nextMonth;
      if (ms < nextYearStart.getTime()) return SMART.laterYear;
      return SMART.later;
    }

    if (ms >= weekStart.getTime()) return SMART.earlierWeek;
    if (ms >= lastWeekStart.getTime()) return SMART.lastWeek;
    if (ms >= monthStart.getTime()) return SMART.earlierMonth;
    if (ms >= lastMonthStart.getTime()) return SMART.lastMonth;
    if (ms >= yearStart.getTime()) return SMART.earlierYear;
    return SMART.older;
  };
}

/** Day: one section per calendar day, "Today"/"Tomorrow"/"Yesterday" within ±1. */
function planDay(
  ctx: GroupingPlanContext,
  locale: string | undefined,
): Bucketer {
  const today = startOfDay(new Date(ctx.now));
  return (value) => {
    const day = toDay(value);
    if (day === null) return null;
    return {
      key: `day:${toISODay(day)}`,
      label:
        relativeDayLabel(day, today) ?? absoluteDayLabel(day, today, locale),
      order: day.getTime(),
    };
  };
}

/** Week: one section per `WEEK_STARTS_ON`-aligned week, named by its first day. */
function planWeek(
  ctx: GroupingPlanContext,
  locale: string | undefined,
): Bucketer {
  const today = startOfDay(new Date(ctx.now));
  return (value) => {
    const day = toDay(value);
    if (day === null) return null;
    const weekStart = startOfWeek(day, WEEK_STARTS_ON);
    return {
      key: `week:${toISODay(weekStart)}`,
      label: weekLabel(weekStart, today, locale),
      order: weekStart.getTime(),
    };
  };
}

/** Month: one section per calendar month, e.g. "May 2026". */
function planMonth(
  _ctx: GroupingPlanContext,
  locale: string | undefined,
): Bucketer {
  return (value) => {
    const day = toDay(value);
    if (day === null) return null;
    const monthStart = startOfMonth(day);
    return {
      // `toISODay` already pads the year and month; slicing its output keeps
      // one definition of that padding rather than re-rolling it here.
      key: `month:${toISODay(monthStart).slice(0, 7)}`,
      label: monthTitle(monthStart, locale),
      order: monthStart.getTime(),
    };
  };
}

/** Year: one section per calendar year, e.g. "2026". */
function planYear(_ctx: GroupingPlanContext): Bucketer {
  return (value) => {
    const day = toDay(value);
    if (day === null) return null;
    const year = day.getFullYear();
    return {
      key: `year:${year}`,
      label: String(year),
      order: new Date(year, 0, 1).getTime(),
    };
  };
}

/**
 * The date type's five groupings, in menu order.
 *
 * `locale` is a parameter so the label formats are pinnable in a test; the
 * shipped `dateGroupings` passes `undefined`, i.e. the viewer's own locale —
 * the same convention as `date-picker/core`'s label helpers.
 */
export function buildDateGroupings(locale?: string): FieldGrouping[] {
  return [
    { id: "smart", label: "Smart", plan: planSmart },
    { id: "day", label: "Day", plan: (ctx) => planDay(ctx, locale) },
    { id: "week", label: "Week", plan: (ctx) => planWeek(ctx, locale) },
    { id: "month", label: "Month", plan: (ctx) => planMonth(ctx, locale) },
    { id: "year", label: "Year", plan: planYear },
  ];
}

/** The contributed grouping set for the `date` field type. */
export const dateGroupings: FieldGrouping[] = buildDateGroupings();
