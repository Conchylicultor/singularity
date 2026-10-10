import { describe, expect, test } from "bun:test";
import { parseRunUntil, runUntilPassed } from "./run-until";

const NOW = new Date("2026-10-10T12:00:00Z");

describe("parseRunUntil", () => {
  test('"" runs until it is turned off', () => {
    expect(parseRunUntil("")).toEqual({ kind: "no-end" });
    expect(parseRunUntil("  ")).toEqual({ kind: "no-end" });
  });

  test("a datetime is the end of the window", () => {
    expect(parseRunUntil("2026-10-12T08:00:00Z")).toEqual({
      kind: "until",
      at: new Date("2026-10-12T08:00:00Z"),
    });
  });

  test("anything else throws rather than reading as no end", () => {
    expect(() => parseRunUntil("monday")).toThrow(/not a datetime/);
  });
});

describe("runUntilPassed", () => {
  test("no end never passes", () => {
    expect(runUntilPassed({ kind: "no-end" }, NOW)).toBe(false);
  });

  test("passes at and after its datetime, not before", () => {
    const at = (iso: string) => ({ kind: "until" as const, at: new Date(iso) });
    expect(runUntilPassed(at("2026-10-10T12:00:01Z"), NOW)).toBe(false);
    expect(runUntilPassed(at("2026-10-10T12:00:00Z"), NOW)).toBe(true);
    expect(runUntilPassed(at("2026-10-09T00:00:00Z"), NOW)).toBe(true);
  });
});
