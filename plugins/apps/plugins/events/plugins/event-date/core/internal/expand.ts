import {
  type EventDate,
  type EventOccurrence,
  type OnceEventDate,
  type RecurrenceRule,
  type RecurringEventDate,
  type Weekday,
  weekdayIndex,
} from "./event-date";
import {
  addUtcDays,
  addUtcMonths,
  daysInUtcMonth,
  isRepresentableInstant,
  startOfUtcDay,
  startOfUtcMonth,
  startOfUtcWeek,
  utcTimeOfDay,
  utcWeekdayIndex,
} from "./utc";

// The MEANING of the format. Nothing on the write path materializes occurrences
// any more, but a date rule that cannot be expanded is a rule nobody can read:
// "what is on Saturday" and any calendar view are exactly this function.
//
// Pure and deterministic — no `Date.now()`, no host timezone, no mutation of the
// input. Two callers depend on that: `nextOccurrence` runs on the write path
// (anchor normalization) and must be reproducible, and the unit tests below are
// only meaningful because the same input always yields the same list.

/**
 * The default hard bound on how many occurrences one call may return.
 *
 * A safety bound, not a window: an unbounded expansion of `every day` over a
 * caller-supplied window is a way to hang the process on a typo'd date.
 */
export const MAX_EXPANDED_OCCURRENCES = 500;

/**
 * Termination backstop on the period walk.
 *
 * The loop already ends when a period starts after the scan end, and the scan
 * end is `min(window.until, rule.until)` — both caller- or page-supplied and
 * finite. This cap exists for the adversarial residue (a window at the edge of
 * the `Date` range, an `interval` of one billion) where that argument gets thin.
 * Under the default `MAX_EXPANDED_OCCURRENCES` it is unreachable for any rule
 * that yields at all: even the sparsest — `monthly` on the 31st — emits ~58 000
 * occurrences before scanning 100 000 months.
 */
const MAX_SCANNED_PERIODS = 100_000;

export interface ExpandWindow {
  from: Date;
  until: Date;
  max?: number;
}

/**
 * Every occurrence of `date` overlapping `[from, until]`, ascending.
 *
 * Overlap, not containment: a three-day festival that started yesterday is on
 * today's calendar. An occurrence with no stated end is treated as an instant.
 */
export function expandEventDate(
  date: EventDate,
  window: ExpandWindow,
): EventOccurrence[] {
  const fromMs = window.from.getTime();
  const untilMs = window.until.getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(untilMs)) {
    throw new Error(
      "[events/event-date] cannot expand over a window with an invalid bound",
    );
  }
  const max = window.max ?? MAX_EXPANDED_OCCURRENCES;
  if (max <= 0) return [];

  if (date.kind === "once") {
    const occurrence = onceOccurrence(date);
    return overlaps(occurrence, fromMs, untilMs) ? [occurrence] : [];
  }

  const out: EventOccurrence[] = [];
  for (const occurrence of seriesOccurrences(date, untilMs)) {
    if (!overlaps(occurrence, fromMs, untilMs)) continue;
    out.push(occurrence);
    if (out.length >= max) break;
  }
  return out;
}

export type NextOccurrence =
  | { found: true; occurrence: EventOccurrence }
  | { found: false; reason: "exhausted" };

/**
 * The first occurrence starting at or after `from` — a discriminated result,
 * never `null`.
 *
 * "There is no next one" is a legitimate answer, not an absorbable failure: a
 * series whose `until` has passed or whose `count` is spent is simply over, and
 * the engine drops it from the write plan on exactly that answer. A nullable
 * return would let a caller conflate it with "not computed".
 *
 * Note the bound: the search walks at most `MAX_SCANNED_PERIODS` periods from
 * the anchor, so a rule that can never fire (`daily` every 7 days filtered to a
 * weekday the anchor's phase never lands on) also reports `exhausted` rather
 * than spinning. That is the honest reading — no occurrence is reachable.
 */
export function nextOccurrence(date: EventDate, from: Date): NextOccurrence {
  const fromMs = from.getTime();
  if (Number.isNaN(fromMs)) {
    throw new Error(
      "[events/event-date] cannot resolve the next occurrence from an invalid date",
    );
  }

  if (date.kind === "once") {
    const occurrence = onceOccurrence(date);
    return occurrence.startsAt.getTime() >= fromMs
      ? { found: true, occurrence }
      : { found: false, reason: "exhausted" };
  }

  for (const occurrence of seriesOccurrences(date, Number.POSITIVE_INFINITY)) {
    if (occurrence.startsAt.getTime() >= fromMs) {
      return { found: true, occurrence };
    }
  }
  return { found: false, reason: "exhausted" };
}

export type AnchorResolution =
  | { found: true; occurrence: EventOccurrence }
  | { found: false; reason: "exhausted" };

/**
 * The occurrence a stored row should carry as its anchor — the format's answer
 * to "given this date and the current time, when does this row say it happens?".
 *
 * The two arms differ, and conflating them is a data-loss bug rather than a
 * cosmetic one:
 *
 * - A **one-off never expires.** Its stated instant IS the fact, and there is
 *   nothing to normalize; last week's concert still happened. So `once` always
 *   resolves, past or not. Routing it through {@link nextOccurrence} instead —
 *   which correctly reports `exhausted` for a date behind `now`, because there
 *   genuinely is no *next* one — drops the event from the engine's write plan
 *   and therefore from its seen-set, and `markEventsDisappeared` then buries
 *   every past event of the source, including the hand-typed ones a `manual`
 *   source echoes.
 * - A **series can genuinely run out**: its `until` has passed or its `count` is
 *   spent, so there is no occurrence left to anchor to and the row is over.
 *
 * That distinction is knowledge about the FORMAT, so it lives here rather than
 * as a `kind` branch in the engine — a future third arm gets its answer right
 * by editing this function, not by remembering to update a caller.
 */
export function resolveAnchor(date: EventDate, now: Date): AnchorResolution {
  if (date.kind === "once") {
    return { found: true, occurrence: onceOccurrence(date) };
  }
  return nextOccurrence(date, now);
}

/* ------------------------------------------------------------------ */

function overlaps(
  occurrence: EventOccurrence,
  fromMs: number,
  untilMs: number,
): boolean {
  const startMs = occurrence.startsAt.getTime();
  const endMs = occurrence.endsAt?.getTime() ?? startMs;
  return startMs <= untilMs && Math.max(endMs, startMs) >= fromMs;
}

function onceOccurrence(date: OnceEventDate): EventOccurrence {
  const startMs = date.startsAt.getTime();
  if (Number.isNaN(startMs)) {
    throw new Error(
      "[events/event-date] cannot expand a date with an invalid startsAt",
    );
  }
  return {
    startsAt: new Date(startMs),
    endsAt: date.endsAt ? new Date(date.endsAt.getTime()) : null,
    allDay: date.allDay ?? false,
  };
}

/**
 * The series, ascending, from the anchor forward.
 *
 * It always starts at the anchor rather than at the window, because `count` is a
 * property of the SERIES ("6 weeks only"), not of whatever slice a caller asked
 * for — counting from the window would make the same series end on different
 * dates depending on who looked.
 *
 * `scanUntilMs` is where the walk stops; callers pass their window's end, or
 * `Infinity` when they want the first hit and nothing more.
 */
function* seriesOccurrences(
  date: RecurringEventDate,
  scanUntilMs: number,
): Generator<EventOccurrence> {
  const anchorMs = date.startsAt.getTime();
  if (Number.isNaN(anchorMs)) {
    throw new Error(
      "[events/event-date] cannot expand a recurring date with an invalid startsAt",
    );
  }
  // The duration is carried verbatim from the anchor occurrence — it is the one
  // thing `endsAt` is there to supply for every other occurrence.
  const durationMs = date.endsAt ? date.endsAt.getTime() - anchorMs : null;
  if (durationMs !== null && Number.isNaN(durationMs)) {
    throw new Error(
      "[events/event-date] cannot expand a recurring date with an invalid endsAt",
    );
  }
  const allDay = date.allDay ?? false;
  const timeOfDay = utcTimeOfDay(anchorMs);

  const rule = date.rule;
  const untilMs = rule.until ? rule.until.getTime() : Number.POSITIVE_INFINITY;
  if (Number.isNaN(untilMs)) {
    throw new Error(
      "[events/event-date] cannot expand a recurrence rule with an invalid until",
    );
  }
  const scanEnd = Math.min(scanUntilMs, untilMs);

  /** Position IN THE SERIES, which is what `count` counts. */
  let position = 0;

  for (let period = 0; period < MAX_SCANNED_PERIODS; period++) {
    const periodStart = periodStartAt(rule, anchorMs, period);
    // Candidates never precede their own period start, so a period past the
    // scan end ends the walk — and this is the check that makes it terminate.
    if (!isRepresentableInstant(periodStart) || periodStart > scanEnd) return;

    for (const startMs of candidateStarts(
      rule,
      anchorMs,
      timeOfDay,
      periodStart,
    )) {
      // The anchor is the series' floor even when it does not itself match the
      // rule: a model that anchors "every Thursday" on a Tuesday still means
      // the Thursdays from that Tuesday on.
      if (startMs < anchorMs) continue;
      if (startMs > untilMs) return;
      if (rule.count !== undefined && position >= rule.count) return;
      position++;
      if (startMs > scanUntilMs) return;
      yield {
        startsAt: new Date(startMs),
        endsAt: durationMs === null ? null : new Date(startMs + durationMs),
        allDay,
      };
    }
  }
}

function periodStartAt(
  rule: RecurrenceRule,
  anchorMs: number,
  period: number,
): number {
  const step = rule.interval * period;
  switch (rule.freq) {
    case "daily":
      return addUtcDays(startOfUtcDay(anchorMs), step);
    case "weekly":
      return addUtcDays(startOfUtcWeek(anchorMs), step * 7);
    case "monthly":
      return addUtcMonths(startOfUtcMonth(anchorMs), step);
    case "yearly":
      return addUtcMonths(startOfUtcMonth(anchorMs), step * 12);
  }
}

/**
 * The starts one period contributes, ascending. May be empty — a month with no
 * 31st contributes nothing to `byMonthDay: [31]`, which is a real fact about the
 * schedule and not a failure.
 *
 * Precedence is fixed and total, so a rule that sets several keys still has
 * exactly one meaning:
 *
 * | freq    | `nthWeekday` | `byMonthDay`      | `byWeekday`             | none            |
 * |---------|--------------|-------------------|-------------------------|-----------------|
 * | daily   | ignored      | filters the day   | filters the day         | the day itself  |
 * | weekly  | ignored      | ignored           | expands to those days   | anchor's weekday|
 * | monthly | 1st priority | 2nd priority      | 3rd: every such weekday | anchor's date   |
 * | yearly  | 1st priority | 2nd priority      | 3rd: every such weekday | anchor's date   |
 *
 * `yearly` walks the anchor's own month; a rule that means a different month
 * belongs in a different anchor.
 */
function candidateStarts(
  rule: RecurrenceRule,
  anchorMs: number,
  timeOfDay: number,
  periodStart: number,
): number[] {
  switch (rule.freq) {
    case "daily": {
      if (
        rule.byWeekday?.length &&
        !weekdaySet(rule.byWeekday).has(utcWeekdayIndex(periodStart))
      ) {
        return [];
      }
      if (
        rule.byMonthDay?.length &&
        !rule.byMonthDay.includes(new Date(periodStart).getUTCDate())
      ) {
        return [];
      }
      return [periodStart + timeOfDay];
    }
    case "weekly": {
      const days = rule.byWeekday?.length
        ? sortedWeekdayIndices(rule.byWeekday)
        : [utcWeekdayIndex(anchorMs)];
      return days.map((day) => addUtcDays(periodStart, day) + timeOfDay);
    }
    case "monthly":
    case "yearly":
      return monthCandidates(rule, anchorMs, timeOfDay, periodStart);
  }
}

function monthCandidates(
  rule: RecurrenceRule,
  anchorMs: number,
  timeOfDay: number,
  monthStart: number,
): number[] {
  const start = new Date(monthStart);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const lastDay = daysInUtcMonth(year, month);

  const days = monthDays(rule, anchorMs, year, month, lastDay);
  return days.map((day) => Date.UTC(year, month, day) + timeOfDay);
}

function monthDays(
  rule: RecurrenceRule,
  anchorMs: number,
  year: number,
  month: number,
  lastDay: number,
): number[] {
  if (rule.nthWeekday) {
    return nthWeekdayDays(
      year,
      month,
      lastDay,
      rule.nthWeekday.nth,
      weekdayIndex(rule.nthWeekday.weekday),
    );
  }
  if (rule.byMonthDay?.length) {
    return uniqueSorted(rule.byMonthDay).filter((day) => day <= lastDay);
  }
  if (rule.byWeekday?.length) {
    const wanted = weekdaySet(rule.byWeekday);
    const days: number[] = [];
    for (let day = 1; day <= lastDay; day++) {
      if (wanted.has(utcWeekdayIndex(Date.UTC(year, month, day)))) {
        days.push(day);
      }
    }
    return days;
  }
  const anchorDay = new Date(anchorMs).getUTCDate();
  return anchorDay <= lastDay ? [anchorDay] : [];
}

/**
 * The nth (or last) occurrence of a weekday in one month, as a 0-or-1 element
 * list — "there is no 5th Monday in February" is emptiness, not an error.
 *
 * `nth: 0` is not: the schema's `min(-1)` admits it, but zero is not a position,
 * and returning nothing for it would make an event silently vanish with no
 * explanation. It throws.
 */
function nthWeekdayDays(
  year: number,
  month: number,
  lastDay: number,
  nth: number,
  wanted: number,
): number[] {
  if (nth === 0) {
    throw new Error(
      "[events/event-date] nthWeekday.nth = 0 is not a position; use 1..5, or -1 for the last",
    );
  }
  if (nth < 0) {
    const lastIndex = utcWeekdayIndex(Date.UTC(year, month, lastDay));
    const day = lastDay - ((lastIndex - wanted + 7) % 7) + (nth + 1) * 7;
    return day >= 1 ? [day] : [];
  }
  const firstIndex = utcWeekdayIndex(Date.UTC(year, month, 1));
  const day = 1 + ((wanted - firstIndex + 7) % 7) + (nth - 1) * 7;
  return day <= lastDay ? [day] : [];
}

function weekdaySet(days: readonly Weekday[]): Set<number> {
  return new Set(days.map(weekdayIndex));
}

function sortedWeekdayIndices(days: readonly Weekday[]): number[] {
  return uniqueSorted(days.map(weekdayIndex));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
