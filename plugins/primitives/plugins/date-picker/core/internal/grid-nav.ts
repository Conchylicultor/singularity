/**
 * Keyboard navigation for the month grid, as pure day arithmetic — no DOM, no
 * React, `bun:test`-able.
 *
 * The calendar's arrow keys are NOT index math over a 6×7 matrix, which is why
 * this is date arithmetic instead: `↓` from the last row leaves the rendered
 * grid entirely and lands in the next month, and `PageDown` moves a whole month
 * at a time. The index space is unbounded, so the only honest state is a `Date`.
 * Building on `addDays` / `addMonths` / `startOfWeek` also inherits their DST
 * survival and month-length clamping for free — a `+ 7 * 86_400_000` here would
 * reintroduce exactly the bug class `day-math.ts` exists to close.
 */

import {
  addDays,
  addMonths,
  endOfWeek,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./day-math";

/** The parts of a keydown this module reads. Deliberately not a `KeyboardEvent`
 *  — that would drag the DOM into `core/`. */
export interface DayNavIntent {
  readonly key: string;
  readonly shiftKey: boolean;
}

/**
 * The day a navigation key moves to from `focused`, or `null` when the key is
 * not one of ours.
 *
 * The `null` is a **predicate, not an absorbed failure** — the same shape as
 * `fromISODay`'s. Every keydown in the grid is offered here, and "this is not a
 * navigation key" (a letter, Tab, Enter) is the expected answer for most of
 * them: the caller branches on it to leave the event alone rather than
 * recovering from a failed move.
 *
 * The mapping is the WAI-ARIA APG date-grid one:
 * `←`/`→` ∓1 day, `↑`/`↓` ∓7 days, `Home`/`End` the focused week's edges,
 * `PageUp`/`PageDown` ∓1 month, and with Shift ∓1 year.
 */
export function resolveDayNavigation(
  intent: DayNavIntent,
  focused: Date,
  weekStartsOn: number,
): Date | null {
  switch (intent.key) {
    case "ArrowLeft":
      return addDays(focused, -1);
    case "ArrowRight":
      return addDays(focused, 1);
    case "ArrowUp":
      return addDays(focused, -7);
    case "ArrowDown":
      return addDays(focused, 7);
    case "Home":
      return startOfWeek(focused, weekStartsOn);
    case "End":
      return endOfWeek(focused, weekStartsOn);
    // A year is 12 months through `addMonths`, not `setFullYear`, so Feb 29 +
    // 1 year clamps to Feb 28 instead of rolling into March.
    case "PageUp":
      return addMonths(focused, intent.shiftKey ? -12 : -1);
    case "PageDown":
      return addMonths(focused, intent.shiftKey ? 12 : 1);
    default:
      return null;
  }
}

/**
 * Whether `day` is inside the inclusive, day-granular `min`/`max` bounds. An
 * absent bound is unbounded on that side.
 *
 * The single definition of "selectable", shared by the day cells' `disabled`
 * state, the keyboard's refusal to move outside the range, and
 * `pickFocusDay`'s search. Two definitions would eventually disagree, and the
 * visible form of that disagreement is a button that looks enabled but cannot
 * be reached (or vice versa).
 */
export function isDayInBounds(day: Date, min?: Date, max?: Date): boolean {
  const time = startOfDay(day).getTime();
  if (min !== undefined && time < startOfDay(min).getTime()) return false;
  if (max !== undefined && time > startOfDay(max).getTime()) return false;
  return true;
}

/**
 * The day that should carry `tabIndex=0` for the rendered month — the calendar's
 * single tab stop, so entering the grid costs one Tab rather than 42.
 *
 * Preference order: the selected day, then today, then the 1st — taking the
 * first candidate that is **inside the view month AND in bounds**. The bounds
 * clause is load-bearing: with a `min` that starts mid-month, a `tabIndex=0` on
 * the (disabled) 1st would drop the whole calendar out of the tab order, since
 * a disabled button is not focusable.
 *
 * The fallback is the first in-bounds day anywhere in the grid — which may be
 * an adjacent-month cell, still a real, reachable button. When the entire grid
 * is out of bounds there is genuinely no reachable target, and the 1st is
 * returned so the function stays total; the roving attribute then lands on a
 * disabled button, which is the accurate rendering of "nothing here is
 * selectable".
 */
export function pickFocusDay(opts: {
  weeks: Date[][];
  viewMonth: Date;
  value?: Date | null;
  today: Date;
  min?: Date;
  max?: Date;
}): Date {
  const { weeks, viewMonth, value, today, min, max } = opts;
  const first = startOfMonth(viewMonth);

  const preferred = [value ?? undefined, today, first];
  for (const candidate of preferred) {
    if (candidate === undefined) continue;
    const day = startOfDay(candidate);
    if (isSameMonth(day, viewMonth) && isDayInBounds(day, min, max)) return day;
  }

  return weeks.flat().find((day) => isDayInBounds(day, min, max)) ?? first;
}
