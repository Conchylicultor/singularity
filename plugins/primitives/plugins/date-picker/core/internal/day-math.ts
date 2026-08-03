/**
 * Local-calendar day arithmetic — the load-bearing half of the date-picker
 * primitive. Pure, runtime-agnostic (no DOM, no React), `bun:test`-able.
 *
 * **Everything here is LOCAL.** A "day" is the user's calendar day, so every
 * operation goes through `Date` setters (`setDate` / `setMonth` / `setHours`)
 * rather than epoch arithmetic. The technique is the one already proven in
 * `plugins/fields/plugins/date/plugins/filter/core/internal/date-anchor.ts`
 * (`addUnits`): setters re-resolve against the local calendar, so a DST
 * transition shifts the *instant* while leaving the *day* count correct.
 * `t + 86_400_000` is the bug this module exists to make unrepresentable — on a
 * spring-forward day it lands 23 hours later, i.e. still the same calendar day.
 *
 * Nothing here mutates its argument; every function returns a fresh `Date`.
 */

/** Local midnight of `d`'s calendar day. */
export function startOfDay(d: Date): Date {
  const out = new Date(d.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * `d` shifted by `n` calendar days, preserving the time-of-day. `setDate`
 * re-resolves against the local calendar, so crossing a DST boundary still
 * advances exactly one day.
 */
export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * `d` shifted by `n` calendar months, **clamped to the target month's length**:
 * Jan 31 + 1 month is Feb 28 (Feb 29 in a leap year), not Mar 3.
 *
 * This is the one deliberate divergence from `date-anchor.ts:addUnits`, which
 * calls `setMonth` directly and therefore overflows. Overflow is invisible for
 * that module's use (it always operates on a start-of-day anchor being shifted
 * for a filter window, where a day of slop is tolerable), but it is a visible
 * bug for a month pager: paging Jan 31 → Feb would skip February entirely.
 * The clamp is implemented by parking the day-of-month at 1 before moving the
 * month, so the intermediate value can never overflow.
 */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  // Day 0 of the following month == the last day of `out`'s month.
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

/** Whether two instants fall on the same LOCAL calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Whether two instants fall in the same LOCAL calendar month (year-aware). */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Local midnight of the first day of `d`'s calendar month. */
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function pad(n: number, width: number): string {
  return String(Math.abs(n)).padStart(width, "0");
}

/**
 * `d`'s LOCAL calendar day as `yyyy-mm-dd`.
 *
 * Deliberately NOT `d.toISOString().slice(0, 10)` — `toISOString` is UTC, so
 * for anyone west of Greenwich every local instant between midnight and the UTC
 * offset serializes as the *previous* day (and east of Greenwich, late evenings
 * serialize as the *next* one). That off-by-one is the class of bug this
 * function exists to close; see the primitive's CLAUDE.md.
 */
export function toISODay(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `yyyy-mm-dd` string into LOCAL midnight of that day, or `null` when
 * the string is not a well-formed calendar day.
 *
 * The `null` is a **parse predicate**, not an absorbed failure: the input is
 * untrusted free text (a URL param, a stored operand, a native `<input>`
 * value), and "this is not a date" is a legitimate, expected answer the caller
 * must branch on — it is never a swallowed error from an operation that was
 * supposed to succeed. `null` is returned for a shape mismatch (`"tomorrow"`,
 * `"2026-6-1"`) AND for a syntactically valid but non-existent day
 * (`"2026-02-30"`), which `new Date(y, m, d)` would otherwise silently roll
 * forward into March.
 *
 * Round-trips with `toISODay` in any timezone: `fromISODay(toISODay(d))` is
 * `startOfDay(d)`.
 */
export function fromISODay(s: string): Date | null {
  const m = ISO_DAY_RE.exec(s);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  // Seed from a fixed local midnight, then set all three fields atomically so
  // no intermediate overflow can occur. (`new Date(year, …)` would remap years
  // 0–99 into the 1900s; `setFullYear` does not.)
  const out = new Date(2000, 0, 1);
  out.setFullYear(year, month - 1, day);

  // A rolled-over day (2026-02-30 → 2026-03-02) no longer serializes back to
  // the input, which is exactly the rejection test.
  return toISODay(out) === s ? out : null;
}

/**
 * Normalize a caller-supplied week start into `0..6` (0 = Sunday, matching
 * `Date#getDay`). A non-integer is a programming error and throws rather than
 * being silently rounded.
 */
export function normalizeWeekStart(weekStartsOn: number): number {
  if (!Number.isInteger(weekStartsOn)) {
    throw new Error(
      `weekStartsOn must be an integer 0-6 (0 = Sunday), got ${String(weekStartsOn)}`,
    );
  }
  return ((weekStartsOn % 7) + 7) % 7;
}

/**
 * The month grid for `month`'s calendar month: **always exactly 6 rows × 7
 * days**, each a local-midnight `Date`. Row 0 starts on the `weekStartsOn`
 * weekday at or before the 1st, so leading/trailing cells are real days from
 * the adjacent months (a consumer distinguishes them with `isSameMonth`).
 *
 * The fixed 6×7 shape is the point: a month needs 4–6 rows depending on its
 * length and start weekday, and a variable row count makes the picker change
 * height as you page through months — a reflow that moves everything below it.
 * Padding to 6 rows unconditionally keeps the surface a stable size.
 */
export function buildMonthGrid(month: Date, weekStartsOn: number): Date[][] {
  const start = normalizeWeekStart(weekStartsOn);
  const first = startOfMonth(month);
  const lead = (first.getDay() - start + 7) % 7;
  const origin = addDays(first, -lead);

  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(origin, week * 7 + day)),
  );
}
