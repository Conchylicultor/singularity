import {
  wallClockToInstant,
  zoneOffsetMs,
} from "@plugins/packages/plugins/wall-clock/core";

type LocalDate = { year: number; month: number; day: number };

/** The calendar date the clock in `timeZone` shows at `instant`. */
function localDate(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const read = (type: "year" | "month" | "day"): number => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Intl gave no "${type}" part for ${timeZone}`);
    }
    return Number(part.value);
  };
  return { year: read("year"), month: read("month"), day: read("day") };
}

const sameDate = (a: LocalDate, b: LocalDate) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * The instant today began in `timeZone`: today's date there, read from `Intl`,
 * at 00:00 on its wall clock. The host's own time zone never enters.
 *
 * On a day whose midnight is skipped by a clock change (Santiago springs
 * forward at 00:00), the day begins at the first wall time that exists (01:00).
 * `wallClockToInstant` lands BEFORE such a gap — on the previous evening — so
 * that case is detected and re-derived with the offset in force before the
 * jump, which puts it exactly at the jump.
 *
 * Throws `RangeError` on a time zone `Intl` does not know.
 */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const today = localDate(now, timeZone);
  const candidate = wallClockToInstant(today, timeZone);
  if (sameDate(localDate(candidate, timeZone), today)) return candidate;

  const midnightUtc = Date.UTC(today.year, today.month - 1, today.day);
  const atJump = new Date(midnightUtc - zoneOffsetMs(candidate, timeZone));
  if (!sameDate(localDate(atJump, timeZone), today)) {
    throw new Error(
      `No start of ${today.year}-${today.month}-${today.day} found in ${timeZone} (tried ${candidate.toISOString()} and ${atJump.toISOString()})`,
    );
  }
  return atJump;
}
