import { describe, expect, test } from "bun:test";

import { addDays, startOfDay } from "./day-math";
import { monthTitle, relativeDayLabel, weekdayLabels } from "./labels";

describe("relativeDayLabel", () => {
  const now = new Date(2026, 7, 3, 14, 30); // Mon Aug 3 2026, mid-afternoon

  test("labels the ±1 day window", () => {
    expect(relativeDayLabel(new Date(2026, 7, 3), now)).toBe("Today");
    expect(relativeDayLabel(new Date(2026, 7, 4), now)).toBe("Tomorrow");
    expect(relativeDayLabel(new Date(2026, 7, 2), now)).toBe("Yesterday");
  });

  test("returns null outside the window", () => {
    expect(relativeDayLabel(new Date(2026, 7, 5), now)).toBeNull();
    expect(relativeDayLabel(new Date(2026, 7, 1), now)).toBeNull();
    expect(relativeDayLabel(new Date(2025, 7, 3), now)).toBeNull();
  });

  test("compares by calendar day, not by elapsed hours", () => {
    // 23h58m apart, but a different calendar day → Tomorrow, not Today.
    expect(relativeDayLabel(new Date(2026, 7, 4, 14, 28), now)).toBe("Tomorrow");
    // 30 minutes apart, same day.
    expect(relativeDayLabel(new Date(2026, 7, 3, 15, 0), now)).toBe("Today");
  });

  test("is exact at both local-midnight edges", () => {
    const today = startOfDay(now);
    const lastInstantOfYesterday = new Date(
      today.getTime() - 1, // 23:59:59.999 the previous day
    );
    expect(relativeDayLabel(lastInstantOfYesterday, now)).toBe("Yesterday");
    expect(relativeDayLabel(today, now)).toBe("Today");

    const endOfToday = new Date(addDays(today, 1).getTime() - 1);
    expect(relativeDayLabel(endOfToday, now)).toBe("Today");
    expect(relativeDayLabel(addDays(today, 1), now)).toBe("Tomorrow");
  });

  test("`now` at either edge of its own day gives the same answers", () => {
    for (const clock of [
      new Date(2026, 7, 3, 0, 0, 0, 0),
      new Date(2026, 7, 3, 23, 59, 59, 999),
    ]) {
      expect(relativeDayLabel(new Date(2026, 7, 3), clock)).toBe("Today");
      expect(relativeDayLabel(new Date(2026, 7, 4), clock)).toBe("Tomorrow");
      expect(relativeDayLabel(new Date(2026, 7, 2), clock)).toBe("Yesterday");
    }
  });

  test("crosses month and year boundaries", () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 0);
    expect(relativeDayLabel(new Date(2027, 0, 1), newYearsEve)).toBe("Tomorrow");
    expect(relativeDayLabel(new Date(2026, 11, 30), newYearsEve)).toBe(
      "Yesterday",
    );
  });

  test("is correct across a DST transition", () => {
    // Spring-forward Sunday: the day is only 23 hours long.
    const springForward = new Date(2026, 2, 8, 12, 0);
    expect(relativeDayLabel(new Date(2026, 2, 9), springForward)).toBe(
      "Tomorrow",
    );
    expect(relativeDayLabel(new Date(2026, 2, 7), springForward)).toBe(
      "Yesterday",
    );
  });
});

describe("weekdayLabels", () => {
  test("returns 7 labels starting at weekStartsOn", () => {
    expect(weekdayLabels(0, "en-US")).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(weekdayLabels(1, "en-US")).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(weekdayLabels(6, "en-US")[0]).toBe("Sat");
  });

  test("wraps an out-of-range week start", () => {
    expect(weekdayLabels(7, "en-US")).toEqual(weekdayLabels(0, "en-US"));
  });

  test("is locale-driven", () => {
    expect(weekdayLabels(1, "fr-FR")).toHaveLength(7);
    expect(weekdayLabels(1, "fr-FR")).not.toEqual(weekdayLabels(1, "en-US"));
  });
});

describe("monthTitle", () => {
  test("renders month + year", () => {
    expect(monthTitle(new Date(2026, 7, 3), "en-US")).toBe("August 2026");
    expect(monthTitle(new Date(2026, 0, 31), "en-US")).toBe("January 2026");
  });

  test("is independent of the day within the month", () => {
    expect(monthTitle(new Date(2026, 7, 1), "en-US")).toBe(
      monthTitle(new Date(2026, 7, 31, 23, 59), "en-US"),
    );
  });
});
