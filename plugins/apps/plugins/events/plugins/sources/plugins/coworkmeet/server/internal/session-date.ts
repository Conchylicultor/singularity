import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import type { EventDate } from "@plugins/apps/plugins/events/plugins/event-date/core";
import {
  isRealWallClock,
  wallClockToInstant,
  type WallClock,
} from "@plugins/packages/plugins/wall-clock/core";

// `("2026-09-10", "14:30:00", "18:00:00")` → two exact UTC instants.
//
// The association publishes a local day and two local times and nothing else, so
// the offset has to come from somewhere: 14:30 in September is 12:30 UTC and
// 14:30 in December is 13:30 UTC, and reading either as UTC puts every summer
// session two hours early. `wall-clock` owns that conversion — this file's job
// is to turn three strings into wall clocks strictly enough that a format change
// is loud.
//
// Pure and clock-free, so the whole thing is unit-testable.

const PARIS = "Europe/Paris";

/** `YYYY-MM-DD`. Deliberately strict: a second published shape must fail loudly. */
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `HH:MM:SS`, the Postgres `time` rendering. */
const TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionDate {
  date: EventDate;
  /**
   * Whether the end time was read as belonging to the NEXT day.
   *
   * Reported rather than silently corrected: it is a reading of an ambiguous
   * publication (an afterwork ending at 01:00 is a real thing, and so is a typo),
   * and the run's caveats are where a reading the data cannot confirm belongs.
   */
  rolledOverMidnight: boolean;
}

interface Parts {
  year: number;
  month: number;
  day: number;
}

function parseDay(text: string, row: string): Parts {
  const match = DAY_PATTERN.exec(text.trim());
  if (match === null) {
    throw new NonRetryableError(`Unreadable session date "${text}" (${row})`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTime(
  text: string,
  row: string,
): { hour: number; minute: number; second: number } {
  const match = TIME_PATTERN.exec(text.trim());
  if (match === null) {
    throw new NonRetryableError(`Unreadable session time "${text}" (${row})`);
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3]),
  };
}

/** Minutes since midnight — how two wall times on the same day are compared. */
function minutesOfDay(t: { hour: number; minute: number }): number {
  return t.hour * 60 + t.minute;
}

/** The calendar day after `parts`, via UTC arithmetic on the civil date alone. */
function nextDay(parts: Parts): Parts {
  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) + DAY_MS,
  );
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function toInstant(w: WallClock, text: string, row: string): Date {
  // Checked here rather than letting `wallClockToInstant` throw `RangeError`: a
  // date the association cannot have meant is the same class of failure as one
  // this file cannot read, and both must park the source with the offending
  // string on them rather than surface as an unlabelled crash.
  if (!isRealWallClock(w)) {
    throw new NonRetryableError(`Impossible session time "${text}" (${row})`);
  }
  return wallClockToInstant(w, PARIS);
}

/**
 * The temporal statement for one session: a `once` with both ends.
 *
 * Throws `NonRetryableError` on anything it cannot read — never a `null` a
 * caller could drop on the floor. That choice is load-bearing: `extract` returns
 * the source's FULL current set, so a row silently skipped is a row the engine
 * stamps `disappearedAt` on. An association that changes its date format must
 * park the source, not empty it.
 *
 * An end at or before the start is read as running past midnight and rolled to
 * the next day, which is what the association means when an afterwork ends at
 * 01:00. Never left as a negative-length event, and never dropped.
 */
export function sessionDate(
  dateSession: string,
  heureDebut: string,
  heureFin: string,
  row: string,
): SessionDate {
  const day = parseDay(dateSession, row);
  const start = parseTime(heureDebut, row);
  const end = parseTime(heureFin, row);

  const rolledOverMidnight = minutesOfDay(end) <= minutesOfDay(start);
  const endDay = rolledOverMidnight ? nextDay(day) : day;

  return {
    date: {
      kind: "once",
      startsAt: toInstant({ ...day, ...start }, heureDebut, row),
      endsAt: toInstant({ ...endDay, ...end }, heureFin, row),
    },
    rolledOverMidnight,
  };
}
