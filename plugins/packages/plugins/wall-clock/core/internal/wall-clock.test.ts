import { describe, expect, it } from "bun:test";
import {
  isRealWallClock,
  wallClockToInstant,
  zoneOffsetMs,
} from "./wall-clock";

const PARIS = "Europe/Paris";
const NEW_YORK = "America/New_York";

// Europe/Paris switches on the last Sunday of March and of October: in 2026
// that is 2026-03-29 (02:00 → 03:00) and 2026-10-25 (03:00 → 02:00).

describe("wallClockToInstant", () => {
  it("reads a summer Paris clock as UTC+2", () => {
    const instant = wallClockToInstant(
      { year: 2026, month: 8, day: 9, hour: 10 },
      PARIS,
    );
    expect(instant.toISOString()).toBe("2026-08-09T08:00:00.000Z");
  });

  it("reads a winter Paris clock as UTC+1", () => {
    const instant = wallClockToInstant(
      { year: 2026, month: 11, day: 8, hour: 10 },
      PARIS,
    );
    expect(instant.toISOString()).toBe("2026-11-08T09:00:00.000Z");
  });

  it("switches offset across the spring transition on the same day", () => {
    // 01:30 is still winter time; 04:30 the same morning is already summer time.
    expect(
      wallClockToInstant(
        { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
        PARIS,
      ).toISOString(),
    ).toBe("2026-03-29T00:30:00.000Z");
    expect(
      wallClockToInstant(
        { year: 2026, month: 3, day: 29, hour: 4, minute: 30 },
        PARIS,
      ).toISOString(),
    ).toBe("2026-03-29T02:30:00.000Z");
  });

  it("resolves a wall time inside the spring-forward gap by shifting it past the gap", () => {
    // 2026-03-29 02:30 Paris never happens — the clocks jump 02:00 → 03:00. The
    // documented resolution is to shift forward by the hour that was skipped, so
    // the answer reads 03:30 on a Paris clock.
    const instant = wallClockToInstant(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
      PARIS,
    );
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(parisClock(instant)).toBe("03/29/2026, 03:30:00");
  });

  it("resolves a wall time inside the autumn overlap to the second occurrence", () => {
    // 2026-10-25 02:30 Paris happens twice: at 00:30Z (still UTC+2) and again at
    // 01:30Z (now UTC+1). The documented resolution is the later one.
    const instant = wallClockToInstant(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
      PARIS,
    );
    expect(instant.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    // Both candidates really do read 02:30 in Paris — the ambiguity is real, not
    // an artifact of the conversion.
    expect(parisClock(new Date("2026-10-25T00:30:00Z"))).toBe(
      "10/25/2026, 02:30:00",
    );
    expect(parisClock(instant)).toBe("10/25/2026, 02:30:00");
  });

  it("is the identity in UTC", () => {
    const instant = wallClockToInstant(
      { year: 2026, month: 1, day: 2, hour: 3, minute: 4, second: 5 },
      "UTC",
    );
    expect(instant.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("moves west of Greenwich the other way", () => {
    // New York in August is UTC-4, so a local morning is a UTC afternoon.
    expect(
      wallClockToInstant(
        { year: 2026, month: 8, day: 9, hour: 10 },
        NEW_YORK,
      ).toISOString(),
    ).toBe("2026-08-09T14:00:00.000Z");
    // …and UTC-5 in January.
    expect(
      wallClockToInstant(
        { year: 2026, month: 1, day: 9, hour: 10 },
        NEW_YORK,
      ).toISOString(),
    ).toBe("2026-01-09T15:00:00.000Z");
  });

  it("defaults an omitted hour, minute and second to 0", () => {
    expect(
      wallClockToInstant({ year: 2026, month: 8, day: 9 }, "UTC").toISOString(),
    ).toBe("2026-08-09T00:00:00.000Z");
    expect(
      wallClockToInstant(
        { year: 2026, month: 8, day: 9, hour: 7 },
        "UTC",
      ).toISOString(),
    ).toBe("2026-08-09T07:00:00.000Z");
  });

  it("takes the month 1-based", () => {
    // The classic off-by-one: month 1 is January, never February.
    expect(
      wallClockToInstant({ year: 2026, month: 1, day: 1 }, "UTC").toISOString(),
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(
      wallClockToInstant(
        { year: 2026, month: 12, day: 31 },
        "UTC",
      ).toISOString(),
    ).toBe("2026-12-31T00:00:00.000Z");
  });

  it("throws RangeError on a wall clock that does not exist", () => {
    expect(() =>
      wallClockToInstant({ year: 2026, month: 2, day: 30 }, PARIS),
    ).toThrow(RangeError);
    expect(() =>
      wallClockToInstant({ year: 2026, month: 13, day: 1 }, PARIS),
    ).toThrow(RangeError);
    expect(() =>
      wallClockToInstant({ year: 2026, month: 8, day: 9, hour: 24 }, PARIS),
    ).toThrow(/Not a real wall clock/);
  });
});

describe("isRealWallClock", () => {
  it("accepts ordinary dates and both leap-year answers", () => {
    expect(isRealWallClock({ year: 2026, month: 8, day: 9 })).toBe(true);
    expect(
      isRealWallClock({
        year: 2026,
        month: 12,
        day: 31,
        hour: 23,
        minute: 59,
        second: 59,
      }),
    ).toBe(true);
    expect(isRealWallClock({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isRealWallClock({ year: 2026, month: 2, day: 29 })).toBe(false);
  });

  it("rejects a day its month does not have", () => {
    expect(isRealWallClock({ year: 2026, month: 2, day: 30 })).toBe(false);
    expect(isRealWallClock({ year: 2026, month: 4, day: 31 })).toBe(false);
    expect(isRealWallClock({ year: 2026, month: 1, day: 0 })).toBe(false);
    expect(isRealWallClock({ year: 2026, month: 1, day: 32 })).toBe(false);
  });

  it("rejects a month outside 1–12 — including the 0 a 0-based caller would pass", () => {
    expect(isRealWallClock({ year: 2026, month: 0, day: 1 })).toBe(false);
    expect(isRealWallClock({ year: 2026, month: 13, day: 1 })).toBe(false);
  });

  it("rejects an impossible time", () => {
    expect(isRealWallClock({ year: 2026, month: 8, day: 9, hour: 24 })).toBe(
      false,
    );
    expect(isRealWallClock({ year: 2026, month: 8, day: 9, hour: -1 })).toBe(
      false,
    );
    expect(isRealWallClock({ year: 2026, month: 8, day: 9, minute: 60 })).toBe(
      false,
    );
    expect(isRealWallClock({ year: 2026, month: 8, day: 9, second: 60 })).toBe(
      false,
    );
    // A leap second is a real second of UTC but never a clock face reading.
    expect(isRealWallClock({ year: 2026, month: 8, day: 9, hour: 23.5 })).toBe(
      false,
    );
  });

  it("says nothing about DST — a gap wall time is still a real clock reading", () => {
    // Ambiguity is `wallClockToInstant`'s business; this predicate is calendar
    // arithmetic only, and 02:30 is a perfectly well-formed clock face.
    expect(
      isRealWallClock({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }),
    ).toBe(true);
  });
});

describe("zoneOffsetMs", () => {
  const HOUR = 60 * 60 * 1000;

  it("is positive east of Greenwich and negative west of it", () => {
    const august = new Date("2026-08-09T12:00:00Z");
    expect(zoneOffsetMs(august, PARIS)).toBe(2 * HOUR);
    expect(zoneOffsetMs(august, NEW_YORK)).toBe(-4 * HOUR);
    expect(zoneOffsetMs(august, "UTC")).toBe(0);
  });

  it("reads the offset in force at that instant, not the zone's standard one", () => {
    expect(zoneOffsetMs(new Date("2026-01-09T12:00:00Z"), PARIS)).toBe(
      1 * HOUR,
    );
    expect(zoneOffsetMs(new Date("2026-08-09T12:00:00Z"), PARIS)).toBe(
      2 * HOUR,
    );
    // Either side of the exact 2026-10-25T01:00:00Z transition.
    expect(zoneOffsetMs(new Date("2026-10-25T00:59:59Z"), PARIS)).toBe(
      2 * HOUR,
    );
    expect(zoneOffsetMs(new Date("2026-10-25T01:00:00Z"), PARIS)).toBe(
      1 * HOUR,
    );
  });

  it("handles a zone whose offset is not a whole number of hours", () => {
    expect(zoneOffsetMs(new Date("2026-08-09T12:00:00Z"), "Asia/Kolkata")).toBe(
      5.5 * HOUR,
    );
  });

  it("throws on a zone Intl cannot resolve rather than reporting 0", () => {
    expect(() => zoneOffsetMs(new Date(), "Mars/Olympus_Mons")).toThrow();
  });
});

/** What a Paris clock reads at `instant`, for asserting the DST resolutions. */
function parisClock(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(instant);
}
