import {
  type EventDate,
  type RecurrenceRule,
  ruleInterval,
  type Weekday,
  weekdayIndex,
} from "./event-date";

// The load-bearing one. `events` is unique on `(source_id, external_id)` and the
// engine upserts against it, so what this returns IS idempotence: re-read the
// same page next week and the second run must update the same rows, not
// duplicate them and bury the originals as disappeared.
//
// The whole reason it exists is the recurring arm. A series' anchor MOVES — next
// week's extraction reports next week's Thursday — so anything derived from the
// anchor would mint a new identity on every refresh. The rule does not move, so
// the rule is the identity.

/**
 * The day an instant falls on, UTC, as `YYYY-MM-DD`.
 *
 * This must stay byte-identical to `startsAtDateKey` in the refresh engine's
 * `external-id.ts`: it is what makes a `once` date's identity survive the switch
 * to this format, so no existing one-off row is duplicated by the deploy. DAY
 * granularity, not instant — pages re-publish the same party with the door time
 * nudged by half an hour. UTC, so the id does not depend on which machine ran.
 *
 * Throws on an invalid `Date`: an unrepresentable identity is a loud failure,
 * never a silently-wrong id.
 */
function utcDayKey(instant: Date): string {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(
      "[events/event-date] cannot derive an identity key from an invalid date",
    );
  }
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The identity contribution of a date — the part of the engine's external id
 * that answers "is this the same event?".
 *
 * - `once` → the UTC day key of `startsAt`. Next week's occurrence of a one-off
 *   is a different day, hence a different event, which is right.
 * - `recurring` → a canonical signature of the RULE, **independent of the
 *   anchor**. The same rule anchored on any Thursday yields the same key, which
 *   is exactly what keeps one series to one row however far its anchor drifts.
 */
export function eventDateIdentityKey(date: EventDate): string {
  if (date.kind === "once") return utcDayKey(date.startsAt);
  return recurrenceSignature(date.rule);
}

/**
 * `weekly:1:wd=mo,th:until=2026-12-31` — canonical, so equal rules written two
 * ways collapse onto one key.
 *
 * Array members are sorted (weekdays into week order, month days ascending) and
 * de-duplicated: `["th","mo"]` and `["mo","th"]` are the same schedule, and
 * letting member order reach the hash would make the identity depend on the
 * order a model happened to list them in — a duplicate row per re-extraction.
 *
 * `until` and `count` are IN the signature: a series that ends is a different
 * series from the same one that runs forever, and merging them onto one row
 * would silently resurrect a finished series. `until` is day-granular for the
 * same reason `once` is.
 *
 * Every part is prefixed (`wd=`, `md=`) because the values collide otherwise —
 * `monthly:1:1,15` cannot be read back as month days rather than weekdays.
 * Nothing here can collide with a `once` key: that one is always `YYYY-MM-DD`.
 */
function recurrenceSignature(rule: RecurrenceRule): string {
  const parts: string[] = [rule.freq, String(ruleInterval(rule))];
  if (rule.byWeekday?.length) {
    parts.push(`wd=${canonicalWeekdays(rule.byWeekday).join(",")}`);
  }
  if (rule.byMonthDay?.length) {
    parts.push(`md=${uniqueSorted(rule.byMonthDay).join(",")}`);
  }
  if (rule.nthWeekday) {
    parts.push(`nth=${rule.nthWeekday.nth}${rule.nthWeekday.weekday}`);
  }
  if (rule.until) parts.push(`until=${utcDayKey(rule.until)}`);
  if (rule.count !== undefined) parts.push(`count=${rule.count}`);
  return parts.join(":");
}

function canonicalWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => weekdayIndex(a) - weekdayIndex(b));
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
