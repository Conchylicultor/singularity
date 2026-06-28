import { describe, expect, it } from "bun:test";
import {
  is,
  isBefore,
  isAfter,
  isOnOrBefore,
  isOnOrAfter,
  isBetween,
  isEmpty,
  isNotEmpty,
  isWithinPast,
  isWithinNext,
} from "./date-filter-logic";
import { withinRange } from "../../core";

// Use noon timestamps so local start-of-day truncation is unambiguous.
const jan10 = new Date("2026-01-10T12:00:00");
const jan15 = new Date("2026-01-15T12:00:00");
const jan20 = new Date("2026-01-20T12:00:00");

describe("date filter operators", () => {
  it("is (same day)", () => {
    expect(is("2026-01-15", jan15)).toBe(true);
    expect(is("2026-01-15", jan10)).toBe(false);
    expect(is("", jan15)).toBe(true); // empty operand → keep
  });

  it("is-before / is-after (day-granular, exclusive)", () => {
    expect(isBefore("2026-01-15", jan10)).toBe(true);
    expect(isBefore("2026-01-15", jan15)).toBe(false);
    expect(isAfter("2026-01-15", jan20)).toBe(true);
    expect(isAfter("2026-01-15", jan15)).toBe(false);
  });

  it("is-on-or-before / is-on-or-after (inclusive)", () => {
    expect(isOnOrBefore("2026-01-15", jan15)).toBe(true);
    expect(isOnOrBefore("2026-01-15", jan20)).toBe(false);
    expect(isOnOrAfter("2026-01-15", jan15)).toBe(true);
    expect(isOnOrAfter("2026-01-15", jan10)).toBe(false);
  });

  it("is-between (inclusive, open bounds)", () => {
    expect(isBetween({ from: "2026-01-10", to: "2026-01-20" }, jan15)).toBe(true);
    expect(isBetween({ from: "2026-01-10", to: "2026-01-20" }, jan10)).toBe(true);
    expect(isBetween({ from: "2026-01-10", to: "2026-01-20" }, jan20)).toBe(true);
    expect(
      isBetween({ from: "2026-01-16", to: "2026-01-20" }, jan15),
    ).toBe(false);
    expect(isBetween({ from: "2026-01-12" }, jan15)).toBe(true);
    expect(isBetween({ to: "2026-01-12" }, jan15)).toBe(false);
    expect(isBetween({}, jan15)).toBe(true); // no bounds → keep
  });

  it("non-date field → drop (when operand present)", () => {
    expect(is("2026-01-15", null)).toBe(false);
    expect(isBefore("2026-01-15", undefined)).toBe(false);
  });

  it("is-empty / is-not-empty", () => {
    expect(isEmpty(undefined, null)).toBe(true);
    expect(isEmpty(undefined, jan15)).toBe(false);
    expect(isNotEmpty(undefined, jan15)).toBe(true);
    expect(isNotEmpty(undefined, undefined)).toBe(false);
  });

  it("accepts {kind:'date'} and {kind:'relative'} anchors", () => {
    // Absolute anchor resolves like a bare string.
    expect(is({ kind: "date", iso: "2026-01-15" }, jan15)).toBe(true);
    expect(isBefore({ kind: "date", iso: "2026-01-15" }, jan10)).toBe(true);
    // Relative "Today" resolves against now; comparing a far-past field stays
    // before today regardless of the exact clock.
    expect(isBefore({ kind: "relative", unit: "day", amount: 0 }, jan10)).toBe(
      true,
    );
    // is-between accepts mixed absolute + relative bounds.
    expect(
      isBetween(
        { from: "2026-01-10", to: { kind: "date", iso: "2026-01-20" } },
        jan15,
      ),
    ).toBe(true);
  });
});

describe("withinRange (pinned now)", () => {
  // Pin now to 2026-01-15 noon → start-of-day 2026-01-15.
  const now = new Date("2026-01-15T12:00:00").getTime();
  const dayMs = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  it("past window is [today - N, today]", () => {
    expect(withinRange({ unit: "week", amount: 1 }, "past", now)).toEqual([
      dayMs("2026-01-08"),
      dayMs("2026-01-15"),
    ]);
    expect(withinRange({ unit: "day", amount: 3 }, "past", now)).toEqual([
      dayMs("2026-01-12"),
      dayMs("2026-01-15"),
    ]);
  });

  it("next window is [today, today + N]", () => {
    expect(withinRange({ unit: "week", amount: 2 }, "next", now)).toEqual([
      dayMs("2026-01-15"),
      dayMs("2026-01-29"),
    ]);
  });

  it("missing / non-positive operand → null (incomplete)", () => {
    expect(withinRange(undefined, "past", now)).toBe(null);
    expect(withinRange({}, "past", now)).toBe(null);
    expect(withinRange({ unit: "week", amount: 0 }, "past", now)).toBe(null);
  });
});

describe("is-within-past / is-within-next predicates", () => {
  // These call withinRange with the live clock; assert against today-relative
  // field values so the result is clock-independent.
  const today = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  it("isWithinPast keeps fields within the past window", () => {
    expect(isWithinPast({ unit: "week", amount: 1 }, today)).toBe(true);
    expect(isWithinPast({ unit: "week", amount: 1 }, daysFromNow(-3))).toBe(true);
    expect(isWithinPast({ unit: "week", amount: 1 }, daysFromNow(-30))).toBe(
      false,
    );
    expect(isWithinPast({ unit: "week", amount: 1 }, daysFromNow(3))).toBe(false);
  });

  it("isWithinNext keeps fields within the next window", () => {
    expect(isWithinNext({ unit: "week", amount: 1 }, today)).toBe(true);
    expect(isWithinNext({ unit: "week", amount: 1 }, daysFromNow(3))).toBe(true);
    expect(isWithinNext({ unit: "week", amount: 1 }, daysFromNow(30))).toBe(
      false,
    );
    expect(isWithinNext({ unit: "week", amount: 1 }, daysFromNow(-3))).toBe(
      false,
    );
  });

  it("incomplete operand → keep; null field → drop", () => {
    expect(isWithinPast(undefined, today)).toBe(true);
    expect(isWithinNext({}, today)).toBe(true);
    expect(isWithinPast({ unit: "week", amount: 1 }, null)).toBe(false);
  });
});
