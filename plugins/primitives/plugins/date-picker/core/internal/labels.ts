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
export function relativeDayLabel(date: Date, now: Date): RelativeDayLabel | null {
  const today = startOfDay(now);
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, addDays(today, 1))) return "Tomorrow";
  if (isSameDay(date, addDays(today, -1))) return "Yesterday";
  return null;
}

/**
 * The seven weekday abbreviations in column order, starting at `weekStartsOn`
 * (0 = Sunday). E.g. `weekdayLabels(1, "en-US")` → Mon…Sun.
 */
export function weekdayLabels(weekStartsOn: number, locale?: string): string[] {
  const start = normalizeWeekStart(weekStartsOn);
  const format = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // Any date, walked back to its own week's Sunday — so the anchor is correct
  // by construction rather than by a hand-verified "this date was a Sunday".
  const anchor = new Date(2021, 0, 3);
  const sunday = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) =>
    format.format(addDays(sunday, (start + i) % 7)),
  );
}

/** The calendar header title for `month`, e.g. "August 2026". */
export function monthTitle(month: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
}
