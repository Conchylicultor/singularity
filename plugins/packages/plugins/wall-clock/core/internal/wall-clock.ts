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

/** A wall clock as a message reads it, for the two errors below. */
function spell(w: FullWallClock): string {
  return `${w.year}-${w.month}-${w.day} ${w.hour}:${w.minute}:${w.second}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * One formatter per zone, kept because building it is the expensive part and a
 * single conversion reads the zone three times. Formatters are immutable and
 * the key set is the IANA zone names, so this is a memo, not state: the same
 * arguments give the same answer with or without it.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  const cached = formatters.get(zone);
  if (cached !== undefined) return cached;
  // An unresolvable zone throws here, and is never cached.
  const made = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(zone, made);
  return made;
}

/** What a clock in `zone` reads at `instant` — the inverse of `wallClockToInstant`. */
export function zoneWallClock(
  instant: Date,
  zone: string,
): Required<WallClock> {
  const parts = zoneFormatter(zone).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Intl gave no "${type}" part for ${zone}`);
    }
    return Number(part.value);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // `hour12: false` renders midnight as "24" in some ICU versions.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** The offset of `zone` at `instant`, in ms, positive east of Greenwich. */
export function zoneOffsetMs(instant: Date, zone: string): number {
  return utcMs(zoneWallClock(instant, zone)) - instant.getTime();
}

/**
 * The UTC instant at which the clock in `zone` reads `w`. Same choice as
 * `Temporal`'s `compatible` for the two wall times that have no single answer.
 *
 * Enumerated rather than iterated. The offsets a day either side of `w` bracket
 * every offset the zone can have at that wall time, so `w` has at most two
 * candidate instants — one per offset. Each is then *verified*: an instant is
 * an answer only if the zone really has, at that instant, the offset the
 * candidate was built from.
 *
 * - **Ordinary wall time.** One candidate survives. It is the answer.
 * - **Autumn overlap.** 2026-10-25 02:30 Paris happens twice, at 00:30Z and
 *   01:30Z. Both survive, and the answer is the **first** — so a day whose
 *   midnight repeats begins at its first midnight rather than an hour into
 *   itself.
 * - **Spring-forward gap.** 2026-03-29 02:30 Paris never happens: the clocks
 *   jump 02:00 → 03:00. Neither candidate survives, and the answer is `w`
 *   carried forward by the hour the clocks skipped — reading 03:30. A wall
 *   time at the very start of a gap therefore lands exactly on the jump, which
 *   is what makes a skipped midnight still the start of its own day.
 *
 * Throws `RangeError` on a wall clock that does not exist in any zone, and a
 * plain `Error` on a zone whose data this does not model, rather than returning
 * an unverified instant.
 */
export function wallClockToInstant(w: WallClock, zone: string): Date {
  const full = fill(w);
  if (!isRealWallClock(full)) {
    throw new RangeError(`Not a real wall clock: ${spell(full)}`);
  }

  const naive = utcMs(full);
  const before = zoneOffsetMs(new Date(naive - DAY_MS), zone);
  const after = zoneOffsetMs(new Date(naive + DAY_MS), zone);

  const real = (before === after ? [before] : [before, after])
    .map((offset) => naive - offset)
    .filter(
      (instant) => zoneOffsetMs(new Date(instant), zone) === naive - instant,
    );
  if (real.length > 0) return new Date(Math.min(...real));

  // Nothing reads `w`: it was skipped by a clock change. Held on the offset in
  // force before the jump, `w` lands past the gap — carried forward by exactly
  // the amount the clocks moved — which is why it must already be on the offset
  // in force after the jump.
  const carried = naive - before;
  if (zoneOffsetMs(new Date(carried), zone) !== after) {
    throw new Error(
      `${zone} has no instant reading ${spell(full)}, and no single clock change over it`,
    );
  }
  return new Date(carried);
}

/**
 * The instant today began in `zone`: the date a clock there shows at `instant`,
 * at the earliest wall time that date has. The host's own time zone never
 * enters.
 *
 * Usually that wall time is midnight. In a zone whose clocks jump at midnight
 * the day starts at the instant of the jump (Santiago springs forward 00:00 →
 * 01:00, so the day starts at 01:00), and in one whose clocks go back onto
 * midnight it starts at the first of the two (Havana) — both of which fall out
 * of `wallClockToInstant` rather than being special-cased here.
 */
export function startOfLocalDay(instant: Date, zone: string): Date {
  const { year, month, day } = zoneWallClock(instant, zone);
  return wallClockToInstant({ year, month, day }, zone);
}
