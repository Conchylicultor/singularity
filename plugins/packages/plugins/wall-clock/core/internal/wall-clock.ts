/** A wall clock: what a clock hanging on a wall in some zone reads. */
export interface WallClock {
  /** Full year. */
  year: number;
  /** 1–12, as humans and ISO write it — NOT the 0-based month `Date.UTC` takes. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0–23. Defaults to 0. */
  hour?: number;
  /** 0–59. Defaults to 0. */
  minute?: number;
  /** 0–59. Defaults to 0. */
  second?: number;
}

/**
 * The same clock with every optional field settled, so the arithmetic below
 * never has to remember which fields default.
 */
type FullWallClock = Required<WallClock>;

function fill(w: WallClock): FullWallClock {
  return {
    year: w.year,
    month: w.month,
    day: w.day,
    hour: w.hour ?? 0,
    minute: w.minute ?? 0,
    second: w.second ?? 0,
  };
}

/**
 * The instant a UTC clock reads `w` — the one place the 1-based month of this
 * API is converted to the 0-based month `Date.UTC` takes.
 *
 * `Date.UTC` maps years 0–99 onto 1900–1999, a legacy quirk that would make
 * year 26 silently mean 1926. A wall clock naming year 26 means year 26, so it
 * is written back explicitly.
 */
function utcMs(w: FullWallClock): number {
  const ms = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  if (w.year >= 0 && w.year < 100) {
    const fixed = new Date(ms);
    fixed.setUTCFullYear(w.year);
    return fixed.getTime();
  }
  return ms;
}

/** Whether these parts name a real calendar date and time (rejects 30 February, month 13, hour 25). */
export function isRealWallClock(w: WallClock): boolean {
  const full = fill(w);
  const { year, month, day, hour, minute, second } = full;
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;

  // Range-checking the day against 1–31 is not enough: `Date.UTC` rolls 30
  // February over into March rather than rejecting it, so the only way to ask
  // whether a day exists in its month is to build it and read it back.
  const probe = new Date(utcMs({ ...full, hour: 0, minute: 0, second: 0 }));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** The offset of `zone` at `instant`, in ms, positive east of Greenwich. */
export function zoneOffsetMs(instant: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Intl gave no "${type}" part for ${zone}`);
    }
    return Number(part.value);
  };

  const wallClock = utcMs({
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // `hour12: false` renders midnight as "24" in some ICU versions.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  });
  return wallClock - instant.getTime();
}

/**
 * The UTC instant at which the clock in `zone` reads `w`.
 *
 * Iterated rather than solved: the offset depends on the instant, which is what
 * we are computing. One correction settles every ordinary date; the second
 * settles a wall time that lands near a DST transition.
 *
 * Neither transition leaves a clean answer, and both resolutions here are the
 * conventional ones. A wall time inside the spring-forward **gap** does not
 * exist at all — the loop lands past the gap, shifted forward by the amount the
 * clocks jumped. A wall time inside the autumn **overlap** happens twice — the
 * loop settles on the second of the two, the one after the clocks went back.
 *
 * Throws `RangeError` on a wall clock that does not exist in any zone.
 */
export function wallClockToInstant(w: WallClock, zone: string): Date {
  if (!isRealWallClock(w)) {
    const { year, month, day, hour, minute, second } = fill(w);
    throw new RangeError(
      `Not a real wall clock: ${year}-${month}-${day} ${hour}:${minute}:${second}`,
    );
  }

  const naive = utcMs(fill(w));
  let instant = naive;
  for (let pass = 0; pass < 2; pass++) {
    const corrected = naive - zoneOffsetMs(new Date(instant), zone);
    if (corrected === instant) break;
    instant = corrected;
  }
  return new Date(instant);
}
