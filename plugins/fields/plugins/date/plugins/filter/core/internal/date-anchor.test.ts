import { describe, expect, it } from "bun:test";
import {
  TODAY,
  addUnits,
  resolveAnchorDay,
  formatAnchor,
  withinRange,
  type DateAnchor,
} from "./date-anchor";

/** Pinned "now": 2026-01-15T12:00 local (noon → unambiguous start-of-day). */
const NOW = new Date("2026-01-15T12:00:00").getTime();

/** Local start-of-day epoch ms for a given yyyy-mm-dd. */
function day(iso: string): number {
  const d = new Date(`${iso}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe("resolveAnchorDay", () => {
  it("Today / Yesterday / Tomorrow", () => {
    expect(resolveAnchorDay(TODAY, NOW)).toBe(day("2026-01-15"));
    expect(
      resolveAnchorDay({ kind: "relative", unit: "day", amount: -1 }, NOW),
    ).toBe(day("2026-01-14"));
    expect(
      resolveAnchorDay({ kind: "relative", unit: "day", amount: 1 }, NOW),
    ).toBe(day("2026-01-16"));
  });

  it("N days / weeks ago & from now", () => {
    expect(
      resolveAnchorDay({ kind: "relative", unit: "day", amount: -3 }, NOW),
    ).toBe(day("2026-01-12"));
    expect(
      resolveAnchorDay({ kind: "relative", unit: "day", amount: 3 }, NOW),
    ).toBe(day("2026-01-18"));
    expect(
      resolveAnchorDay({ kind: "relative", unit: "week", amount: -2 }, NOW),
    ).toBe(day("2026-01-01"));
    expect(
      resolveAnchorDay({ kind: "relative", unit: "week", amount: 1 }, NOW),
    ).toBe(day("2026-01-22"));
  });

  it("legacy bare ISO string (absolute)", () => {
    expect(resolveAnchorDay("2026-03-10", NOW)).toBe(day("2026-03-10"));
  });

  it("{kind:'date'} absolute anchor", () => {
    expect(
      resolveAnchorDay({ kind: "date", iso: "2026-03-10" }, NOW),
    ).toBe(day("2026-03-10"));
  });

  it("null / empty / invalid → null", () => {
    expect(resolveAnchorDay(null, NOW)).toBe(null);
    expect(resolveAnchorDay(undefined, NOW)).toBe(null);
    expect(resolveAnchorDay("", NOW)).toBe(null);
    expect(resolveAnchorDay("not-a-date", NOW)).toBe(null);
    expect(resolveAnchorDay({ kind: "date", iso: "" }, NOW)).toBe(null);
  });
});

describe("addUnits (calendar-safe)", () => {
  it("month/year shift respects Date setter semantics", () => {
    // setMonth semantics across a month-end boundary: 2026-03-31 - 1 month
    // overflows to early March (matching native Date behaviour). We assert it
    // matches a fresh Date with the same setter sequence rather than a fixed day.
    const base = day("2026-03-31");
    const ref = new Date(base);
    ref.setMonth(ref.getMonth() - 1);
    ref.setHours(0, 0, 0, 0);
    expect(addUnits(base, "month", -1)).toBe(ref.getTime());
    expect(Number.isNaN(addUnits(base, "month", -1))).toBe(false);

    const yearBase = day("2024-02-29"); // leap day
    const yref = new Date(yearBase);
    yref.setFullYear(yref.getFullYear() + 1);
    yref.setHours(0, 0, 0, 0);
    expect(addUnits(yearBase, "year", 1)).toBe(yref.getTime());
  });

  it("amount 0 → same start-of-day", () => {
    expect(addUnits(day("2026-01-15"), "day", 0)).toBe(day("2026-01-15"));
  });
});

describe("withinRange", () => {
  it("past → [today − N, today]; next → [today, today + N]", () => {
    expect(withinRange({ unit: "day", amount: 3 }, "past", NOW)).toEqual([
      day("2026-01-12"),
      day("2026-01-15"),
    ]);
    expect(withinRange({ unit: "week", amount: 1 }, "next", NOW)).toEqual([
      day("2026-01-15"),
      day("2026-01-22"),
    ]);
  });

  it("missing / non-positive amount → null (incomplete rule)", () => {
    expect(withinRange(null, "past", NOW)).toBe(null);
    expect(withinRange({ unit: "day" }, "next", NOW)).toBe(null);
    expect(withinRange({ unit: "day", amount: 0 }, "past", NOW)).toBe(null);
    expect(withinRange({ unit: "day", amount: -2 }, "next", NOW)).toBe(null);
  });
});

describe("formatAnchor", () => {
  it("relative day presets", () => {
    expect(formatAnchor(TODAY)).toBe("Today");
    expect(formatAnchor({ kind: "relative", unit: "day", amount: -1 })).toBe(
      "Yesterday",
    );
    expect(formatAnchor({ kind: "relative", unit: "day", amount: 1 })).toBe(
      "Tomorrow",
    );
  });

  it("relative N-unit labels (pluralization + direction)", () => {
    expect(formatAnchor({ kind: "relative", unit: "day", amount: -3 })).toBe(
      "3 days ago",
    );
    expect(formatAnchor({ kind: "relative", unit: "week", amount: 2 })).toBe(
      "2 weeks from now",
    );
    expect(formatAnchor({ kind: "relative", unit: "month", amount: -1 })).toBe(
      "1 month ago",
    );
    expect(formatAnchor({ kind: "relative", unit: "year", amount: 1 })).toBe(
      "1 year from now",
    );
  });

  it("absolute date → locale short date", () => {
    const expected = new Date("2026-01-15T00:00:00").toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" },
    );
    expect(formatAnchor({ kind: "date", iso: "2026-01-15" } as DateAnchor)).toBe(
      expected,
    );
    expect(formatAnchor("2026-01-15")).toBe(expected);
  });

  it("empty → placeholder-friendly ''", () => {
    expect(formatAnchor(null)).toBe("");
    expect(formatAnchor("")).toBe("");
    expect(formatAnchor(undefined)).toBe("");
  });
});
