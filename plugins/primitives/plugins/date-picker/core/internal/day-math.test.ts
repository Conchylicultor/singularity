import { describe, expect, test } from "bun:test";

import {
  addDays,
  addMonths,
  buildMonthGrid,
  endOfWeek,
  fromISODay,
  isSameDay,
  isSameMonth,
  normalizeWeekStart,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toISODay,
} from "./day-math";

/**
 * These tests assume the suite runs under a negative-UTC-offset timezone with
 * DST — `TZ=America/Los_Angeles` — because that is the configuration where the
 * UTC-vs-local bug class is visible at all. `bunfig.toml` does not pin TZ, so
 * assert it here rather than silently passing in UTC where every case is
 * degenerate.
 */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const IS_LA = TZ === "America/Los_Angeles";

describe("startOfDay", () => {
  test("truncates to local midnight without mutating the input", () => {
    const d = new Date(2026, 7, 3, 17, 42, 13, 456);
    const start = startOfDay(d);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(3);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    // Input untouched.
    expect(d.getHours()).toBe(17);
  });
});

describe("addDays across DST", () => {
  // US spring-forward 2026: Sunday March 8, 02:00 → 03:00 (a 23-hour day).
  test("spring forward advances exactly one calendar day", () => {
    const before = new Date(2026, 2, 7, 12, 0, 0);
    const after = addDays(before, 1);
    expect(after.getDate()).toBe(8);
    expect(after.getMonth()).toBe(2);
    expect(after.getHours()).toBe(12);
    if (IS_LA) {
      // The proof that setters, not epoch math, are doing the work: the elapsed
      // wall time is 23 hours, so `+86_400_000` would have landed on March 9.
      expect(after.getTime() - before.getTime()).toBe(23 * 60 * 60 * 1000);
    }
  });

  // US fall-back 2026: Sunday November 1, 02:00 → 01:00 (a 25-hour day).
  test("fall back advances exactly one calendar day", () => {
    const before = new Date(2026, 9, 31, 12, 0, 0);
    const after = addDays(before, 1);
    expect(after.getDate()).toBe(1);
    expect(after.getMonth()).toBe(10);
    expect(after.getHours()).toBe(12);
    if (IS_LA) {
      expect(after.getTime() - before.getTime()).toBe(25 * 60 * 60 * 1000);
    }
  });

  test("stepping a whole DST week keeps midnight at midnight", () => {
    let cursor = startOfDay(new Date(2026, 2, 5));
    for (let i = 0; i < 7; i++) {
      expect(cursor.getHours()).toBe(0);
      cursor = addDays(cursor, 1);
    }
    expect(toISODay(cursor)).toBe("2026-03-12");
  });

  test("negative steps and zero", () => {
    const d = new Date(2026, 0, 1, 9, 30);
    expect(toISODay(addDays(d, -1))).toBe("2025-12-31");
    expect(toISODay(addDays(d, 0))).toBe("2026-01-01");
  });
});

describe("addMonths", () => {
  test("Jan → Feb → Mar walk on a mid-month day", () => {
    const jan = new Date(2026, 0, 15);
    const feb = addMonths(jan, 1);
    const mar = addMonths(feb, 1);
    expect(toISODay(feb)).toBe("2026-02-15");
    expect(toISODay(mar)).toBe("2026-03-15");
    expect(toISODay(addMonths(jan, 2))).toBe("2026-03-15");
  });

  test("Jan 31 clamps to the end of February (non-leap)", () => {
    expect(toISODay(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
  });

  test("Jan 31 clamps to Feb 29 in a leap year", () => {
    expect(toISODay(addMonths(new Date(2028, 0, 31), 1))).toBe("2028-02-29");
  });

  test("clamping is not sticky — Jan 31 + 2 months is Mar 31", () => {
    expect(toISODay(addMonths(new Date(2026, 0, 31), 2))).toBe("2026-03-31");
  });

  test("crosses year boundaries in both directions", () => {
    expect(toISODay(addMonths(new Date(2026, 11, 15), 1))).toBe("2027-01-15");
    expect(toISODay(addMonths(new Date(2026, 0, 15), -1))).toBe("2025-12-15");
    expect(toISODay(addMonths(new Date(2026, 2, 31), -1))).toBe("2026-02-28");
  });

  test("preserves the time-of-day", () => {
    const out = addMonths(new Date(2026, 0, 15, 13, 45, 30), 1);
    expect(out.getHours()).toBe(13);
    expect(out.getMinutes()).toBe(45);
    expect(out.getSeconds()).toBe(30);
  });
});

describe("isSameDay / isSameMonth", () => {
  test("same day regardless of time-of-day", () => {
    expect(
      isSameDay(new Date(2026, 7, 3, 0, 0), new Date(2026, 7, 3, 23, 59, 59)),
    ).toBe(true);
  });

  test("adjacent days, and same day-of-month in different months/years", () => {
    expect(isSameDay(new Date(2026, 7, 3), new Date(2026, 7, 4))).toBe(false);
    expect(isSameDay(new Date(2026, 6, 3), new Date(2026, 7, 3))).toBe(false);
    expect(isSameDay(new Date(2025, 7, 3), new Date(2026, 7, 3))).toBe(false);
  });

  test("isSameMonth is year-aware", () => {
    expect(isSameMonth(new Date(2026, 7, 1), new Date(2026, 7, 31))).toBe(true);
    expect(isSameMonth(new Date(2025, 7, 1), new Date(2026, 7, 1))).toBe(false);
  });
});

describe("startOfMonth", () => {
  test("returns local midnight on the 1st", () => {
    const out = startOfMonth(new Date(2026, 7, 22, 18, 5));
    expect(toISODay(out)).toBe("2026-08-01");
    expect(out.getHours()).toBe(0);
  });
});

describe("toISODay / fromISODay", () => {
  test("serializes the LOCAL day, not the UTC day", () => {
    expect(toISODay(new Date(2026, 7, 3, 0, 30))).toBe("2026-08-03");
    expect(toISODay(new Date(2026, 7, 3, 23, 30))).toBe("2026-08-03");
    expect(toISODay(new Date(2026, 11, 31, 20, 0))).toBe("2026-12-31");

    if (IS_LA) {
      // Pin the divergence explicitly, so this fails loudly if anyone
      // "simplifies" toISODay back to `toISOString().slice(0,10)`: at UTC-7/8
      // any late-evening local instant has already rolled over in UTC.
      expect(new Date(2026, 7, 3, 23, 30).toISOString().slice(0, 10)).toBe(
        "2026-08-04",
      );
      expect(new Date(2026, 11, 31, 20, 0).toISOString().slice(0, 10)).toBe(
        "2027-01-01",
      );
    }
  });

  test("round-trips every day of a year", () => {
    let cursor = startOfDay(new Date(2026, 0, 1));
    for (let i = 0; i < 366; i++) {
      const iso = toISODay(cursor);
      const parsed = fromISODay(iso);
      expect(parsed).not.toBeNull();
      // Non-null asserted above; narrow for the compiler.
      if (parsed === null) throw new Error("unreachable");
      expect(toISODay(parsed)).toBe(iso);
      expect(isSameDay(parsed, cursor)).toBe(true);
      expect(parsed.getHours()).toBe(0);
      cursor = addDays(cursor, 1);
    }
  });

  test("round-trips across both DST transitions at an evening local time", () => {
    for (const d of [
      new Date(2026, 2, 8, 22, 0),
      new Date(2026, 10, 1, 22, 0),
      new Date(2026, 2, 7, 22, 0),
      new Date(2026, 9, 31, 22, 0),
    ]) {
      const iso = toISODay(d);
      const parsed = fromISODay(iso);
      if (parsed === null) throw new Error(`failed to parse ${iso}`);
      expect(isSameDay(parsed, d)).toBe(true);
    }
  });

  test("pads single-digit months and days", () => {
    expect(toISODay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  test("rejects malformed strings", () => {
    for (const s of [
      "",
      "tomorrow",
      "2026-6-1",
      "26-06-01",
      "2026/06/01",
      "2026-06-01T00:00:00Z",
      " 2026-06-01",
      "2026-13-01",
      "2026-00-01",
      "2026-06-00",
    ]) {
      expect(fromISODay(s)).toBeNull();
    }
  });

  test("rejects a syntactically valid but non-existent day", () => {
    expect(fromISODay("2026-02-30")).toBeNull();
    expect(fromISODay("2026-02-29")).toBeNull(); // 2026 is not a leap year
    expect(fromISODay("2028-02-29")).not.toBeNull(); // 2028 is
    expect(fromISODay("2026-04-31")).toBeNull();
  });

  test("parses to local midnight", () => {
    const d = fromISODay("2026-08-03");
    if (d === null) throw new Error("unreachable");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });
});

describe("normalizeWeekStart", () => {
  test("passes 0-6 through and wraps out-of-range integers", () => {
    expect(normalizeWeekStart(0)).toBe(0);
    expect(normalizeWeekStart(6)).toBe(6);
    expect(normalizeWeekStart(7)).toBe(0);
    expect(normalizeWeekStart(-1)).toBe(6);
  });

  test("throws on a non-integer rather than rounding", () => {
    expect(() => normalizeWeekStart(1.5)).toThrow();
    expect(() => normalizeWeekStart(NaN)).toThrow();
  });
});

describe("startOfWeek / endOfWeek", () => {
  // Aug 14 2026 is a Friday.
  const friday = new Date(2026, 7, 14);

  test("walks back to the configured week start", () => {
    expect(toISODay(startOfWeek(friday, 0))).toBe("2026-08-09"); // Sunday
    expect(toISODay(startOfWeek(friday, 1))).toBe("2026-08-10"); // Monday
    expect(toISODay(startOfWeek(friday, 6))).toBe("2026-08-08"); // Saturday
  });

  test("a day already on the week start is its own start", () => {
    expect(toISODay(startOfWeek(new Date(2026, 7, 9), 0))).toBe("2026-08-09");
    expect(toISODay(startOfWeek(friday, 5))).toBe("2026-08-14");
  });

  test("endOfWeek is always six days after startOfWeek", () => {
    for (const weekStartsOn of [0, 1, 3, 6]) {
      const start = startOfWeek(friday, weekStartsOn);
      expect(toISODay(endOfWeek(friday, weekStartsOn))).toBe(
        toISODay(addDays(start, 6)),
      );
      expect(endOfWeek(friday, weekStartsOn).getDay()).toBe(
        (weekStartsOn + 6) % 7,
      );
    }
  });

  test("the edges cross month and year boundaries", () => {
    expect(toISODay(startOfWeek(new Date(2026, 7, 1), 0))).toBe("2026-07-26");
    expect(toISODay(endOfWeek(new Date(2026, 7, 31), 0))).toBe("2026-09-05");
    expect(toISODay(startOfWeek(new Date(2027, 0, 1), 0))).toBe("2026-12-27");
  });

  test("wraps an out-of-range week start", () => {
    expect(toISODay(startOfWeek(friday, 7))).toBe(
      toISODay(startOfWeek(friday, 0)),
    );
    expect(toISODay(startOfWeek(friday, -1))).toBe(
      toISODay(startOfWeek(friday, 6)),
    );
  });

  test("throws on a non-integer week start rather than rounding", () => {
    expect(() => startOfWeek(friday, 1.5)).toThrow();
    expect(() => endOfWeek(friday, NaN)).toThrow();
  });

  test("preserves the time-of-day — truncation is startOfDay's job", () => {
    const out = startOfWeek(new Date(2026, 7, 14, 17, 42), 1);
    expect(toISODay(out)).toBe("2026-08-10");
    expect(out.getHours()).toBe(17);
    expect(out.getMinutes()).toBe(42);
  });

  test("spans a DST transition without losing a day", () => {
    // Spring-forward Sunday is March 8 2026; the week Mar 8–14 is 167 hours.
    expect(toISODay(startOfWeek(new Date(2026, 2, 11), 0))).toBe("2026-03-08");
    expect(toISODay(endOfWeek(new Date(2026, 2, 11), 0))).toBe("2026-03-14");
    // Fall-back Sunday is November 1 2026; that week is 169 hours.
    expect(toISODay(startOfWeek(new Date(2026, 10, 4), 0))).toBe("2026-11-01");
    expect(toISODay(endOfWeek(new Date(2026, 10, 4), 0))).toBe("2026-11-07");
  });
});

describe("buildMonthGrid", () => {
  const MONTHS = [
    new Date(2026, 0, 15), // Jan 2026 — starts Thu
    new Date(2026, 1, 15), // Feb 2026 — 28 days starting Sun (the 4-row month)
    new Date(2026, 7, 15), // Aug 2026
    new Date(2028, 1, 15), // Feb 2028 — leap
    new Date(2026, 2, 15), // Mar 2026 — spans spring-forward
    new Date(2026, 10, 15), // Nov 2026 — spans fall-back
  ];

  test("is always exactly 6 rows of 7 days", () => {
    for (const month of MONTHS) {
      for (const weekStartsOn of [0, 1, 6]) {
        const grid = buildMonthGrid(month, weekStartsOn);
        expect(grid.length).toBe(6);
        for (const week of grid) expect(week.length).toBe(7);
      }
    }
  });

  test("each row starts on that row's own startOfWeek", () => {
    // The grid's alignment and the calendar's Home/End edges are one
    // definition; if they diverged, Home would land off the row's first cell.
    for (const month of MONTHS) {
      for (const weekStartsOn of [0, 1, 3, 6]) {
        for (const week of buildMonthGrid(month, weekStartsOn)) {
          expect(toISODay(week[0]!)).toBe(
            toISODay(startOfWeek(week[3]!, weekStartsOn)),
          );
        }
      }
    }
  });

  test("every row starts on weekStartsOn", () => {
    for (const month of MONTHS) {
      for (const weekStartsOn of [0, 1, 3, 6]) {
        for (const week of buildMonthGrid(month, weekStartsOn)) {
          expect(week[0]!.getDay()).toBe(weekStartsOn);
        }
      }
    }
  });

  test("cells are consecutive local-midnight days", () => {
    const flat = buildMonthGrid(new Date(2026, 2, 15), 0).flat();
    expect(flat.length).toBe(42);
    for (const [i, day] of flat.entries()) {
      expect(day.getHours()).toBe(0);
      if (i > 0) expect(isSameDay(day, addDays(flat[i - 1]!, 1))).toBe(true);
    }
  });

  test("contains every day of the target month", () => {
    for (const month of MONTHS) {
      const flat = buildMonthGrid(month, 1).flat();
      const inMonth = flat.filter((d) => isSameMonth(d, month));
      const lastDay = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0,
      ).getDate();
      expect(inMonth.length).toBe(lastDay);
      expect(toISODay(inMonth[0]!)).toBe(toISODay(startOfMonth(month)));
    }
  });

  test("pads with adjacent-month days — August 2026, weeks start Sunday", () => {
    // Aug 1 2026 is a Saturday, so the first row is Jul 26 … Aug 1.
    const grid = buildMonthGrid(new Date(2026, 7, 20), 0);
    expect(grid[0]!.map(toISODay)).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
    ]);
    expect(toISODay(grid[5]![6]!)).toBe("2026-09-05");
  });

  test("the 4-row month (Feb 2026, weeks start Sunday) still yields 6 rows", () => {
    const grid = buildMonthGrid(new Date(2026, 1, 10), 0);
    expect(grid.length).toBe(6);
    expect(toISODay(grid[0]![0]!)).toBe("2026-02-01");
    expect(toISODay(grid[5]![6]!)).toBe("2026-03-14");
  });

  test("the displayed month is independent of the seed day's time-of-day", () => {
    const a = buildMonthGrid(new Date(2026, 7, 1, 0, 0), 1)
      .flat()
      .map(toISODay);
    const b = buildMonthGrid(new Date(2026, 7, 31, 23, 59), 1)
      .flat()
      .map(toISODay);
    expect(a).toEqual(b);
  });
});
