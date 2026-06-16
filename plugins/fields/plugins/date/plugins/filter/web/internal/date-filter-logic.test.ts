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
} from "./date-filter-logic";

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
});
