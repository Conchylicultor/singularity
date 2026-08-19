import { describe, expect, it } from "bun:test";
import { parseCourseInstant } from "./instant";

describe("parseCourseInstant", () => {
  it("reads the colon-less offset the school actually publishes", () => {
    // Summer: Paris is UTC+2, so 19:00 local is 17:00Z.
    expect(parseCourseInstant("2026-08-31T19:00:00+0200").toISOString()).toBe(
      "2026-08-31T17:00:00.000Z",
    );
  });

  it("follows the offset the school states, not a fixed one", () => {
    // Winter: the same 19:00 course is 18:00Z, and the school says so itself —
    // which is why this plugin needs no timezone database.
    expect(parseCourseInstant("2026-11-16T19:00:00+0100").toISOString()).toBe(
      "2026-11-16T18:00:00.000Z",
    );
  });

  it("accepts the ISO spellings too", () => {
    expect(parseCourseInstant("2026-11-16T19:00:00+01:00").toISOString()).toBe(
      "2026-11-16T18:00:00.000Z",
    );
    expect(parseCourseInstant("2026-11-16T18:00:00Z").toISOString()).toBe(
      "2026-11-16T18:00:00.000Z",
    );
  });

  it("throws rather than yielding an Invalid Date", () => {
    // The whole point of parsing by hand: `new Date` answers NaN here, and NaN
    // reaches an events row before anyone notices.
    expect(() => parseCourseInstant("31/08/2026 19h00")).toThrow();
    expect(() => parseCourseInstant("2026-02-30T19:00:00+0100")).toThrow();
    expect(() => parseCourseInstant("2026-08-31T25:00:00+0200")).toThrow();
  });
});
