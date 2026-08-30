import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  isRealWallClock,
  wallClockToInstant,
} from "@plugins/packages/plugins/wall-clock/core";
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
//     summer walk two hours early. The conversion is
//     `packages/wall-clock`'s job, not this file's.
//
// Pure and `Date`-injected so the whole thing is unit-testable without a clock.

const PARIS = "Europe/Paris";

/** 1-based, matching `WallClock#month`. */
const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
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
    // Pre-checked rather than caught: `wallClockToInstant` throws on 30 February,
    // and a candidate year that does not have the published day is an ordinary
    // "try the next year", not an error.
    if (!isRealWallClock({ year, month, day })) continue;
    // The weekday of the published CIVIL date — not of the resolved instant,
    // which for an evening event can fall on the previous UTC day. `Date.UTC`
    // stays 0-based, unlike `WallClock#month`.
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== weekday) {
      continue;
    }

    const startsAt = wallClockToInstant(
      { year, month, day, hour, minute },
      PARIS,
    );
    if (startsAt.getTime() < floor) continue;
    return { kind: "once", startsAt };
  }

  throw new NonRetryableError(
    `No plausible year for visit date "${text}" — no ${weekdayName} falls on ${dayText} ${monthName} within ${YEAR_CANDIDATES} years of ${today.toISOString().slice(0, 10)}`,
  );
}
