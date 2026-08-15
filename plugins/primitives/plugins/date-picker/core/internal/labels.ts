/**
 * Human labels for a calendar day — `Intl`-driven, so the month name and the
 * weekday abbreviations follow the viewer's locale instead of a hardcoded
 * English table.
 */

import { addDays, isSameDay, normalizeWeekStart, startOfDay } from "./day-math";

/** The closed relative vocabulary for a CONCRETE calendar day. */
export type RelativeDayLabel = "Today" | "Tomorrow" | "Yesterday";

/**
 * The relative name of `date` as seen from `now`, or `null` when the day is
 * further out than ±1 and the caller should fall back to an absolute format.
 *
 * This is the single source of the relative vocabulary shared by the picker's
 * preset row and the page editor's `@` date menu, so the two can never disagree
 * about what "Tomorrow" means.
 *
 * **Not the same concern as `formatAnchor`** in
 * `fields/date/plugins/filter/core` — that one labels a *relative anchor*
 * operand (`{kind:"relative", unit, amount}`, a rule that re-resolves as the
 * clock advances). This one labels a *concrete date* against a concrete `now`.
 * They coincidentally share three words; merging them would couple the filter's
 * operand model to the picker's display layer.
 *
 * `now` is a required parameter, not a `Date.now()` default: every caller
 * already has the "now" its surface is rendering against, and an implicit clock
 * read is exactly what makes this kind of function untestable.
 */
export function relativeDayLabel(
  date: Date,
  now: Date,
): RelativeDayLabel | null {
  const today = startOfDay(now);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, addDays(today, 1))) return "Tomorrow";
  if (isSameDay(date, addDays(today, -1))) return "Yesterday";
  return null;
}

/** A weekday column header, in both the forms the grid needs at once. */
export interface WeekdayLabel {
  /** The abbreviation printed in the header cell, e.g. "Mon". */
  short: string;
  /** The full name the header cell announces, e.g. "Monday". */
  long: string;
}

/**
 * The seven weekday labels in column order, starting at `weekStartsOn`
 * (0 = Sunday). E.g. `weekdayLabels(1, "en-US")[0]` → `{short:"Mon", long:"Monday"}`.
 *
 * Both forms come out of ONE walk over the same seven days, because the column
 * header shows the abbreviation and announces the full name — two renderings of
 * the same weekday, which must not be able to drift apart (a header reading
 * "Mon" while announcing "Tuesday" is worse than either alone).
 */
export function weekdayLabels(
  weekStartsOn: number,
  locale?: string,
): WeekdayLabel[] {
  const start = normalizeWeekStart(weekStartsOn);
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long" });
  // Any date, walked back to its own week's Sunday — so the anchor is correct
  // by construction rather than by a hand-verified "this date was a Sunday".
  const anchor = new Date(2021, 0, 3);
  const sunday = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(sunday, (start + i) % 7);
    return { short: short.format(day), long: long.format(day) };
  });
}

/**
 * The full accessible name of a day cell, e.g. "Friday, August 21, 2026".
 *
 * The visible label of a day button is the bare number ("21"), which on its own
 * answers neither "which weekday?" nor "which month?" — both of which a grid
 * cell must carry, because a screen-reader user arrives at it by arrow key with
 * no view of the surrounding month.
 */
export function dayLabel(day: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(day);
}

/** The calendar header title for `month`, e.g. "August 2026". */
export function monthTitle(month: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
}
