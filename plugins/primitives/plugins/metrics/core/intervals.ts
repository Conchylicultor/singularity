import {
  wallClockToInstant,
  zoneWallClock,
} from "@plugins/packages/plugins/wall-clock/core";

// THE one bucketing implementation. Every metric — SQL-backed or evaluated in
// JS — receives the intervals built here, so a day boundary is derived exactly
// once, in the query's time zone, and nothing downstream (date_trunc, a
// `toISOString().slice(0, 10)` key) can drift from it.
//
// Calendar arithmetic runs on local DATES (year / month / day in the zone), and
// only the final boundary is turned into an instant through `wall-clock`. So a
// day across a DST change is 23 or 25 hours, a week starts on a local Monday,
// and the previous period is shifted in calendar units, never in milliseconds.

export type Preset = "7d" | "30d" | "90d" | "1y";
export const PRESETS = ["7d", "30d", "90d", "1y"] as const;

export type BucketUnit = "day" | "week" | "month";
export const BUCKET_UNITS = ["day", "week", "month"] as const;

/** Half-open `[start, end)`, both ISO instants. */
export interface Interval {
  start: string;
  end: string;
}

export interface Bucket extends Interval {
  /** The bucket covers less than its calendar unit (clipped by now or by a custom range). */
  partial: boolean;
  /** Axis label: "Sep 3", or "Sep" for a month. */
  short: string;
  /** Tooltip / drawer label: "Sat, Sep 3", "Sep 3 – Sep 9" or "September 2026". */
  label: string;
}

export type RangeSpec =
  { preset: Preset } | { interval: Interval; bucket: BucketUnit };

export interface ResolvedRange {
  unit: BucketUnit;
  buckets: Bucket[];
  /** The whole range as one interval: the first bucket's start to the last one's end. */
  range: Interval;
  /** The same buckets shifted back by the range's own length in calendar units, clipped like-for-like. */
  previous: Bucket[];
  previousRange: Interval;
  /** "Previous 30 days", "Previous year", "Previous period". */
  previousLabel: string;
}

/** A range the caller asked for that cannot be bucketed (the handler answers 400). */
export class InvalidRangeError extends Error {
  override name = "InvalidRangeError";
}

const PRESET_SHAPE: Record<
  Preset,
  { unit: BucketUnit; count: number; previousLabel: string }
> = {
  "7d": { unit: "day", count: 7, previousLabel: "Previous 7 days" },
  "30d": { unit: "day", count: 30, previousLabel: "Previous 30 days" },
  "90d": { unit: "day", count: 90, previousLabel: "Previous 90 days" },
  // 53 Monday-aligned weeks: a full year plus the current, partial week — and
  // shifting by 53 weeks keeps the previous period on the same weekdays.
  "1y": { unit: "week", count: 53, previousLabel: "Previous year" },
};

/** Guards a custom range from asking for an unbounded number of buckets. */
export const MAX_BUCKETS = 1000;

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch (err) {
    if (err instanceof RangeError) return false;
    throw err;
  }
}

export function resolveRange(
  spec: RangeSpec,
  now: Date,
  tz: string,
): ResolvedRange {
  if (!isTimeZone(tz)) throw new InvalidRangeError(`unknown time zone "${tz}"`);

  let unit: BucketUnit;
  let first: LocalDate;
  let count: number;
  let clipStart: number;
  let clipEnd: number;
  let previousLabel: string;

  if ("preset" in spec) {
    const shape = PRESET_SHAPE[spec.preset];
    unit = shape.unit;
    count = shape.count;
    previousLabel = shape.previousLabel;
    first = addUnits(unitStart(localDateOf(now, tz), unit), unit, -(count - 1));
    clipStart = instantOf(first, tz);
    clipEnd = now.getTime();
  } else {
    unit = spec.bucket;
    previousLabel = "Previous period";
    clipStart = Date.parse(spec.interval.start);
    const end = Date.parse(spec.interval.end);
    if (Number.isNaN(clipStart) || Number.isNaN(end)) {
      throw new InvalidRangeError("interval bounds must be ISO instants");
    }
    if (clipStart >= end) {
      throw new InvalidRangeError("interval start must be before its end");
    }
    // A custom range reaching into the future ends now, like a preset.
    clipEnd = Math.min(end, now.getTime());
    if (clipStart >= clipEnd) {
      throw new InvalidRangeError("interval starts in the future");
    }
    first = unitStart(localDateOf(new Date(clipStart), tz), unit);
    count = 0;
    for (let u = first; instantOf(u, tz) < clipEnd; u = addUnits(u, unit, 1)) {
      if (++count > MAX_BUCKETS) {
        throw new InvalidRangeError(
          `interval spans more than ${MAX_BUCKETS} ${unit} buckets`,
        );
      }
    }
  }

  const units = Array.from({ length: count }, (_, i) =>
    unitSpan(addUnits(first, unit, i), unit, tz),
  );
  const buckets = units.map((u) => {
    const start = Math.max(u.start, clipStart);
    const end = Math.min(u.end, clipEnd);
    return makeBucket(u, start, end, tz);
  });
  const previous = units.map((u, i) => {
    const p = unitSpan(addUnits(u.date, unit, -count), unit, tz);
    const b = buckets[i]!;
    const start = Date.parse(b.start);
    const end = Date.parse(b.end);
    // Clip only where the current bucket is clipped, by the same elapsed time
    // into its unit: a partial today is compared with the same part of the day
    // a period ago. An unclipped side takes the previous unit's own boundary,
    // so a 23-hour day is still compared with a whole day.
    return makeBucket(
      p,
      start === u.start
        ? p.start
        : Math.min(p.start + (start - u.start), p.end),
      end === u.end ? p.end : Math.min(p.start + (end - u.start), p.end),
      tz,
    );
  });

  return {
    unit,
    buckets,
    range: { start: buckets[0]!.start, end: buckets.at(-1)!.end },
    previous,
    previousRange: { start: previous[0]!.start, end: previous.at(-1)!.end },
    previousLabel,
  };
}

// ── Calendar arithmetic on local dates ──────────────────────────────────────

interface LocalDate {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
}

interface UnitSpan {
  unit: BucketUnit;
  date: LocalDate;
  start: number;
  end: number;
}

function localDateOf(instant: Date, tz: string): LocalDate {
  const { year, month, day } = zoneWallClock(instant, tz);
  return { year, month, day };
}

function instantOf(d: LocalDate, tz: string): number {
  return wallClockToInstant(d, tz).getTime();
}

// `Date.UTC` used as a pure proleptic calendar (it normalises day 0 / day 32 /
// month 13): no instant is read from it.
function calendar(year: number, month: number, day: number): LocalDate {
  const d = new Date(Date.UTC(year, month - 1, day));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** 0 = Monday … 6 = Sunday. */
function weekdayFromMonday(d: LocalDate): number {
  return (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
}

function unitStart(d: LocalDate, unit: BucketUnit): LocalDate {
  switch (unit) {
    case "day":
      return d;
    case "week":
      return calendar(d.year, d.month, d.day - weekdayFromMonday(d));
    case "month":
      return { year: d.year, month: d.month, day: 1 };
  }
}

function addUnits(d: LocalDate, unit: BucketUnit, n: number): LocalDate {
  switch (unit) {
    case "day":
      return calendar(d.year, d.month, d.day + n);
    case "week":
      return calendar(d.year, d.month, d.day + 7 * n);
    case "month":
      return calendar(d.year, d.month + n, 1);
  }
}

function unitSpan(date: LocalDate, unit: BucketUnit, tz: string): UnitSpan {
  return {
    unit,
    date,
    start: instantOf(date, tz),
    end: instantOf(addUnits(date, unit, 1), tz),
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────

const formatters = new Map<string, Intl.DateTimeFormat>();

function format(
  instant: number,
  tz: string,
  kind: "short" | "day" | "month" | "monthLong",
): string {
  const key = `${tz}|${kind}`;
  let f = formatters.get(key);
  if (f === undefined) {
    const options: Intl.DateTimeFormatOptions =
      kind === "short"
        ? { month: "short", day: "numeric" }
        : kind === "day"
          ? { weekday: "short", month: "short", day: "numeric" }
          : kind === "month"
            ? { month: "short" }
            : { month: "long", year: "numeric" };
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz });
    formatters.set(key, f);
  }
  return f.format(new Date(instant));
}

function makeBucket(
  u: UnitSpan,
  start: number,
  end: number,
  tz: string,
): Bucket {
  const partial = start > u.start || end < u.end;
  const iso = {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
  switch (u.unit) {
    case "day":
      return {
        ...iso,
        partial,
        short: format(u.start, tz, "short"),
        label: format(u.start, tz, "day"),
      };
    case "week": {
      const lastDay = instantOf(
        calendar(u.date.year, u.date.month, u.date.day + 6),
        tz,
      );
      return {
        ...iso,
        partial,
        short: format(u.start, tz, "short"),
        label: `${format(u.start, tz, "short")} – ${format(lastDay, tz, "short")}`,
      };
    }
    case "month":
      return {
        ...iso,
        partial,
        short: format(u.start, tz, "month"),
        label: format(u.start, tz, "monthLong"),
      };
  }
}
