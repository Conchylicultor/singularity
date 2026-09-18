import { describe, expect, test } from "bun:test";
import { startOfLocalDay } from "./local-day";

const at = (iso: string) => new Date(iso);

describe("startOfLocalDay", () => {
  test("UTC: midnight UTC", () => {
    expect(
      startOfLocalDay(at("2026-09-18T15:30:00Z"), "UTC").toISOString(),
    ).toBe("2026-09-18T00:00:00.000Z");
  });

  test("east of Greenwich: today there may still be yesterday in UTC", () => {
    // 23:30 UTC on the 17th is 08:30 on the 18th in Tokyo (UTC+9).
    expect(
      startOfLocalDay(at("2026-09-17T23:30:00Z"), "Asia/Tokyo").toISOString(),
    ).toBe("2026-09-17T15:00:00.000Z");
  });

  test("west of Greenwich: today there may already be tomorrow in UTC", () => {
    // 02:00 UTC on the 19th is 22:00 on the 18th in New York (EDT, UTC-4).
    expect(
      startOfLocalDay(
        at("2026-09-19T02:00:00Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-09-18T04:00:00.000Z");
  });

  test("the day clocks spring forward: midnight still on the old offset", () => {
    // New York switches EST → EDT at 02:00 on 2026-03-08. Midnight was EST (UTC-5).
    expect(
      startOfLocalDay(
        at("2026-03-08T18:00:00Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
  });

  test("the day clocks fall back: midnight still on the old offset", () => {
    // New York switches EDT → EST at 02:00 on 2026-11-01. Midnight was EDT (UTC-4).
    expect(
      startOfLocalDay(
        at("2026-11-01T18:00:00Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  test("a zone whose clocks jump over midnight: the day begins at 01:00", () => {
    // Santiago springs forward at 00:00 → 01:00 on 2026-09-06 (UTC-4 → UTC-3).
    expect(
      startOfLocalDay(
        at("2026-09-06T15:00:00Z"),
        "America/Santiago",
      ).toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });

  test("whatever the zone, the start is the first instant of the local day", () => {
    // Any day's start is on that day, at the earliest wall time it has.
    for (const zone of ["America/Santiago", "America/New_York", "Asia/Tokyo"]) {
      const start = startOfLocalDay(at("2026-09-06T12:00:00Z"), zone);
      const earlier = new Date(start.getTime() - 1);
      const dateIn = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(d);
      expect(dateIn(start)).not.toBe(dateIn(earlier));
    }
  });

  test("an unknown time zone throws", () => {
    expect(() => startOfLocalDay(new Date(), "Not/AZone")).toThrow(RangeError);
  });
});
