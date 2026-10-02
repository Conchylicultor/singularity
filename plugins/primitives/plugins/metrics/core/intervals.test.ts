import { describe, expect, test } from "bun:test";
import { zoneWallClock } from "@plugins/packages/plugins/wall-clock/core";
import { InvalidRangeError, resolveRange, type Interval } from "./intervals";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Wednesday 30 Sep 2026, 15:00 UTC.
const NOW = new Date("2026-09-30T15:00:00Z");

function span(iv: Interval): number {
  return Date.parse(iv.end) - Date.parse(iv.start);
}

function weekday(iso: string, tz: string): number {
  const { year, month, day } = zoneWallClock(new Date(iso), tz);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

describe("day presets", () => {
  const r = resolveRange({ preset: "7d" }, NOW, "UTC");

  test("seven day buckets ending with a partial today", () => {
    expect(r.unit).toBe("day");
    expect(r.buckets.map((b) => b.start)).toEqual([
      "2026-09-24T00:00:00.000Z",
      "2026-09-25T00:00:00.000Z",
      "2026-09-26T00:00:00.000Z",
      "2026-09-27T00:00:00.000Z",
      "2026-09-28T00:00:00.000Z",
      "2026-09-29T00:00:00.000Z",
      "2026-09-30T00:00:00.000Z",
    ]);
    expect(r.buckets.map((b) => b.partial)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(r.buckets.at(-1)!.end).toBe(NOW.toISOString());
    expect(r.range).toEqual({
      start: "2026-09-24T00:00:00.000Z",
      end: NOW.toISOString(),
    });
  });

  test("labels", () => {
    expect(r.buckets.at(-1)!.short).toBe("Sep 30");
    expect(r.buckets.at(-1)!.label).toBe("Wed, Sep 30");
  });

  test("the previous period is seven days back, its last bucket clipped like-for-like", () => {
    expect(r.previous[0]!.start).toBe("2026-09-17T00:00:00.000Z");
    const last = r.previous.at(-1)!;
    expect(last.start).toBe("2026-09-23T00:00:00.000Z");
    // Today is 15 h in: the day a week ago is compared over its first 15 h.
    expect(last.end).toBe("2026-09-23T15:00:00.000Z");
    expect(last.partial).toBe(true);
    expect(r.previous.slice(0, -1).every((b) => !b.partial)).toBe(true);
    expect(r.previousRange).toEqual({
      start: "2026-09-17T00:00:00.000Z",
      end: "2026-09-23T15:00:00.000Z",
    });
    expect(r.previousLabel).toBe("Previous 7 days");
  });

  test("30d and 90d", () => {
    expect(resolveRange({ preset: "30d" }, NOW, "UTC").buckets).toHaveLength(
      30,
    );
    const q = resolveRange({ preset: "90d" }, NOW, "UTC");
    expect(q.buckets).toHaveLength(90);
    expect(q.previous[0]!.start).toBe(
      new Date(Date.parse(q.buckets[0]!.start) - 90 * DAY).toISOString(),
    );
  });
});

describe("1y", () => {
  const r = resolveRange({ preset: "1y" }, NOW, "UTC");

  test("53 Monday-aligned weeks, the current one partial", () => {
    expect(r.unit).toBe("week");
    expect(r.buckets).toHaveLength(53);
    expect(r.buckets.every((b) => weekday(b.start, "UTC") === 1)).toBe(true);
    expect(r.buckets.at(-1)!.start).toBe("2026-09-28T00:00:00.000Z");
    expect(r.buckets.at(-1)!.partial).toBe(true);
    expect(r.buckets.at(-1)!.end).toBe(NOW.toISOString());
    expect(r.buckets[0]!.start).toBe("2025-09-29T00:00:00.000Z");
    expect(r.buckets.slice(0, -1).every((b) => span(b) === 7 * DAY)).toBe(true);
  });

  test("week labels", () => {
    expect(r.buckets.at(-1)!.short).toBe("Sep 28");
    expect(r.buckets.at(-1)!.label).toBe("Sep 28 – Oct 4");
  });

  test("the previous period is 53 weeks back, on the same weekdays", () => {
    expect(r.previous).toHaveLength(53);
    expect(r.previous.every((b) => weekday(b.start, "UTC") === 1)).toBe(true);
    for (const [i, b] of r.previous.entries()) {
      expect(Date.parse(r.buckets[i]!.start) - Date.parse(b.start)).toBe(
        53 * 7 * DAY,
      );
    }
    const last = r.previous.at(-1)!;
    expect(last.start).toBe("2025-09-22T00:00:00.000Z");
    // Two days and 15 h into the current week.
    expect(last.end).toBe("2025-09-24T15:00:00.000Z");
    expect(r.previousLabel).toBe("Previous year");
  });
});

describe("a DST zone", () => {
  // Paris leaves summer time on Sunday 25 Oct 2026 (03:00 → 02:00).
  const PARIS = "Europe/Paris";
  const now = new Date("2026-10-27T10:00:00Z");
  const r = resolveRange({ preset: "7d" }, now, PARIS);

  test("every boundary is a local midnight", () => {
    for (const b of r.buckets) {
      const w = zoneWallClock(new Date(b.start), PARIS);
      expect([w.hour, w.minute, w.second]).toEqual([0, 0, 0]);
    }
  });

  test("the day the clocks go back is 25 hours", () => {
    const oct25 = r.buckets.find((b) => b.short === "Oct 25")!;
    expect(oct25.start).toBe("2026-10-24T22:00:00.000Z");
    expect(oct25.end).toBe("2026-10-25T23:00:00.000Z");
    expect(span(oct25)).toBe(25 * HOUR);
    expect(oct25.partial).toBe(false);
  });

  test("today starts at local midnight in winter time", () => {
    expect(r.buckets.at(-1)!.start).toBe("2026-10-26T23:00:00.000Z");
  });

  test("the previous period is shifted in calendar days, not in hours", () => {
    // Seven days before 21 Oct is 14 Oct, a summer-time midnight (22:00 UTC).
    expect(r.buckets[0]!.start).toBe("2026-10-20T22:00:00.000Z");
    expect(r.previous[0]!.start).toBe("2026-10-13T22:00:00.000Z");
    const prevOfOct25 =
      r.previous[r.buckets.findIndex((b) => b.short === "Oct 25")]!;
    // An unclipped 25 h day is compared with the whole 24 h day a week earlier.
    expect(span(prevOfOct25)).toBe(24 * HOUR);
    expect(prevOfOct25.partial).toBe(false);
  });
});

describe("a custom interval", () => {
  const r = resolveRange(
    {
      interval: {
        start: "2026-01-15T00:00:00.000Z",
        end: "2026-04-10T00:00:00.000Z",
      },
      bucket: "month",
    },
    NOW,
    "UTC",
  );

  test("month buckets clipped to the interval at both ends", () => {
    expect(r.unit).toBe("month");
    expect(r.buckets.map((b) => [b.start, b.end, b.partial])).toEqual([
      ["2026-01-15T00:00:00.000Z", "2026-02-01T00:00:00.000Z", true],
      ["2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z", false],
      ["2026-03-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z", false],
      ["2026-04-01T00:00:00.000Z", "2026-04-10T00:00:00.000Z", true],
    ]);
    expect(r.buckets.map((b) => b.short)).toEqual(["Jan", "Feb", "Mar", "Apr"]);
    expect(r.buckets[0]!.label).toBe("January 2026");
    expect(r.previousLabel).toBe("Previous period");
  });

  test("the previous period is as many months back, clipped the same way", () => {
    expect(r.previous.map((b) => [b.start, b.end])).toEqual([
      ["2025-09-15T00:00:00.000Z", "2025-10-01T00:00:00.000Z"],
      ["2025-10-01T00:00:00.000Z", "2025-11-01T00:00:00.000Z"],
      ["2025-11-01T00:00:00.000Z", "2025-12-01T00:00:00.000Z"],
      ["2025-12-01T00:00:00.000Z", "2025-12-10T00:00:00.000Z"],
    ]);
  });

  test("a range reaching into the future ends now", () => {
    const f = resolveRange(
      {
        interval: {
          start: "2026-09-28T00:00:00.000Z",
          end: "2026-10-10T00:00:00.000Z",
        },
        bucket: "day",
      },
      NOW,
      "UTC",
    );
    expect(f.buckets).toHaveLength(3);
    expect(f.range.end).toBe(NOW.toISOString());
    expect(f.buckets.at(-1)!.partial).toBe(true);
  });
});

describe("invalid ranges", () => {
  test.each([
    ["an unknown zone", { preset: "7d" as const }, "Mars/Olympus"],
    [
      "an empty interval",
      {
        interval: {
          start: "2026-01-02T00:00:00Z",
          end: "2026-01-01T00:00:00Z",
        },
        bucket: "day" as const,
      },
      "UTC",
    ],
    [
      "an interval in the future",
      {
        interval: {
          start: "2027-01-01T00:00:00Z",
          end: "2027-02-01T00:00:00Z",
        },
        bucket: "day" as const,
      },
      "UTC",
    ],
    [
      "too many buckets",
      {
        interval: {
          start: "2000-01-01T00:00:00Z",
          end: "2026-01-01T00:00:00Z",
        },
        bucket: "day" as const,
      },
      "UTC",
    ],
  ])("%s", (_name, spec, tz) => {
    expect(() => resolveRange(spec, NOW, tz)).toThrow(InvalidRangeError);
  });
});
