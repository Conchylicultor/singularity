// Every calendar step this plugin takes is a UTC step. That is the contract, not
// a shortcut: the stored anchor is an exact published instant, and expansion
// advances it in whole UTC days so the same series expands byte-identically on
// every machine that reads it. Walking in the host's local zone would make the
// read side depend on where it ran, and there is no timezone database here to
// walk a real IANA zone with (see this plugin's CLAUDE.md for the consequence).

export const MS_PER_DAY = 86_400_000;

/** The largest instant a `Date` can hold; past it every getter returns NaN. */
const MAX_TIME = 8_640_000_000_000_000;

/**
 * Whether `ms` is a time a `Date` can actually represent.
 *
 * The expander's termination proof rests on period starts advancing until they
 * pass the scan end — an out-of-range start would read back as NaN, compare
 * false against everything, and never end the loop.
 */
export function isRepresentableInstant(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_TIME;
}

/** 0 = Monday … 6 = Sunday — the index order of `WEEKDAYS`, not `Date`'s Sunday-first one. */
export function utcWeekdayIndex(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

export function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Monday 00:00 UTC of the week containing `ms` — weeks start on Monday because `WEEKDAYS` does. */
export function startOfUtcWeek(ms: number): number {
  return startOfUtcDay(ms) - utcWeekdayIndex(ms) * MS_PER_DAY;
}

export function startOfUtcMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Milliseconds since the anchor's own UTC midnight — the time of day every
 * occurrence of the series inherits verbatim. Adding it back to a midnight
 * reconstructs the anchor exactly, because UTC days are all 86 400 000 ms.
 */
export function utcTimeOfDay(ms: number): number {
  return ms - startOfUtcDay(ms);
}

export function addUtcDays(ms: number, days: number): number {
  return ms + days * MS_PER_DAY;
}

/** `ms` must be a month start; returns the start of the month `months` later. */
export function addUtcMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
}

export function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
