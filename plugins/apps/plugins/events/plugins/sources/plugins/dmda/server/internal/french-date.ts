import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import type { EventDate } from "@plugins/apps/plugins/events/plugins/event-date/core";

// `"Dimanche 09 Août à 10h00"` → an exact UTC instant.
//
// This is the ONLY interesting part of this source type, because it is the only
// field the site does not already hand us structured. Two things make it real
// work rather than a `Date` constructor call:
//
//  1. **There is no year.** The site publishes a weekday, a day, a month and a
//     time, and nothing else — not in the list API, not in the detail page's
//     Schema.org block (whose `startDate` is empty). The weekday is what closes
//     the gap: `Dimanche 09 Août` is 2026 and not 2027, because 2027-08-09 is a
//     Monday. So the weekday is not decoration to skip past — it is the year.
//
//  2. **The time is Paris wall-clock, and `startsAt` is a UTC instant.** August
//     is UTC+2 and November is UTC+1, so reading `10h00` as UTC puts every
//     summer walk two hours early. There is no timezone database in this repo
//     (`event-date/CLAUDE.md` documents that on purpose), so the offset is
//     resolved through `Intl` at the candidate instant.
//
// Pure and `Date`-injected so the whole thing is unit-testable without a clock.

const PARIS = "Europe/Paris";

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 0,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
};

/** Sunday-first, because this is compared against `Date#getUTCDay`. */
const WEEKDAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

/**
 * `Weekday DD Month à HHhMM` — the only shape all 17 live rows use. Deliberately
 * strict: a site that starts publishing a second shape must fail loudly here
 * rather than have its rows quietly vanish one at a time.
 */
const PATTERN =
  /^(\p{L}+)\s+(\d{1,2})\s+(\p{L}+)\s+à\s+(\d{1,2})\s*h\s*(\d{2})$/u;

/**
 * How far into the past a listed date may resolve before we read it as next
 * year's instead.
 *
 * The site lists upcoming walks, but leaves one up for a while after it runs, so
 * "yesterday" has to stay yesterday. A month is comfortably longer than that lag
 * and comfortably shorter than the ~1 year gap to the next weekday-matching
 * candidate, so no real date is ambiguous under it.
 */
const PAST_TOLERANCE_MS = 30 * 24 * 60 * 60 * 1000;

/** How many years forward to consider. A weekday matches at most one of any two. */
const YEAR_CANDIDATES = 3;

/**
 * The offset of `zone` at a given instant, in ms (positive east of Greenwich).
 *
 * Read by formatting the instant *in* the zone and diffing the resulting wall
 * clock against the instant — the standard trick, and the only one available
 * without a tz database.
 */
function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Intl gave no "${type}" part for ${zone}`);
    }
    return Number(part.value);
  };

  const wallClock = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    // `hour12: false` renders midnight as "24" in some ICU versions.
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return wallClock - instant;
}

/**
 * The UTC instant at which the clock in `zone` reads the given wall time.
 *
 * Iterated rather than solved: the offset depends on the instant, which is what
 * we are computing. One correction settles every ordinary date; the second
 * settles a wall time that lands near a DST transition. A wall time inside the
 * spring-forward gap does not exist — the loop converges on the instant just
 * after it, which is the conventional resolution.
 */
function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): number {
  const naive = Date.UTC(year, month, day, hour, minute);
  let instant = naive;
  for (let pass = 0; pass < 2; pass++) {
    const corrected = naive - zoneOffsetMs(instant, zone);
    if (corrected === instant) break;
    instant = corrected;
  }
  return instant;
}

/** Whether `year-month-day` is a real calendar date (rejects "31 février"). */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month, day));
  return probe.getUTCMonth() === month && probe.getUTCDate() === day;
}

/**
 * Parse one published visit date.
 *
 * Throws `NonRetryableError` on anything it cannot read — never a `null` a
 * caller could drop on the floor. That choice is the whole safety property here:
 * this extractor returns the source's FULL current set, so a row silently
 * skipped is a row the engine stamps `disappearedAt` on. A site that changes its
 * date format must park the source with the offending string on it, not empty it.
 */
export function parseFrenchVisitDate(text: string, today: Date): EventDate {
  const normalized = text.normalize("NFC").trim().toLowerCase();
  const match = PATTERN.exec(normalized);
  if (match === null) {
    throw new NonRetryableError(`Unreadable visit date: "${text}"`);
  }

  const [, weekdayName, dayText, monthName, hourText, minuteText] = match;
  const month = MONTHS[monthName!];
  if (month === undefined) {
    throw new NonRetryableError(
      `Unknown French month "${monthName}" in visit date: "${text}"`,
    );
  }
  const weekday = WEEKDAYS_FR.indexOf(
    weekdayName as (typeof WEEKDAYS_FR)[number],
  );
  if (weekday === -1) {
    throw new NonRetryableError(
      `Unknown French weekday "${weekdayName}" in visit date: "${text}"`,
    );
  }

  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) {
    throw new NonRetryableError(`Impossible time in visit date: "${text}"`);
  }

  const floor = today.getTime() - PAST_TOLERANCE_MS;
  const firstYear = today.getUTCFullYear();
  for (let i = 0; i < YEAR_CANDIDATES; i++) {
    const year = firstYear + i;
    if (!isRealCalendarDate(year, month, day)) continue;
    // The weekday of the published CIVIL date — not of the resolved instant,
    // which for an evening event can fall on the previous UTC day.
    if (new Date(Date.UTC(year, month, day)).getUTCDay() !== weekday) continue;

    const instant = wallClockToUtc(year, month, day, hour, minute, PARIS);
    if (instant < floor) continue;
    return { kind: "once", startsAt: new Date(instant) };
  }

  throw new NonRetryableError(
    `No plausible year for visit date "${text}" — no ${weekdayName} falls on ${dayText} ${monthName} within ${YEAR_CANDIDATES} years of ${today.toISOString().slice(0, 10)}`,
  );
}
