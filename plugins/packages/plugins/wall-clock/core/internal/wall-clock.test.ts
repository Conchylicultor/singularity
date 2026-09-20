import { describe, expect, it, test } from "bun:test";
import {
  isRealWallClock,
  startOfLocalDay,
  wallClockToInstant,
  zoneOffsetMs,
  zoneWallClock,
  type WallClock,
} from "./wall-clock";

const PARIS = "Europe/Paris";
const NEW_YORK = "America/New_York";
const SANTIAGO = "America/Santiago";
const HAVANA = "America/Havana";
const LORD_HOWE = "Australia/Lord_Howe";
const TOKYO = "Asia/Tokyo";

// Europe/Paris switches on the last Sunday of March and of October: in 2026
// that is 2026-03-29 (02:00 → 03:00) and 2026-10-25 (03:00 → 02:00). The zones
// west of Greenwich switch on the second Sunday of March and the first of
// November; Santiago and Havana do it at midnight, which is what makes a wrong
// answer land on the previous day.

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

  describe("a wall time the clocks skipped", () => {
    it("is carried past the gap, east of Greenwich", () => {
      // 2026-03-29 02:30 Paris never happens — the clocks jump 02:00 → 03:00.
      const instant = wallClockToInstant(
        { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
        PARIS,
      );
      expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
      expect(clockIn(instant, PARIS)).toBe("2026-03-29 03:30");
    });

    it("is carried past the gap west of Greenwich too", () => {
      // The sign of the offset used to decide this, and west of Greenwich the
      // answer came out an hour BEFORE the gap, at 01:30.
      const instant = wallClockToInstant(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        NEW_YORK,
      );
      expect(instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
      expect(clockIn(instant, NEW_YORK)).toBe("2026-03-08 03:30");
    });

    it("stays on the day it was asked about when the jump is at midnight", () => {
      // Santiago springs forward 00:00 → 01:00 on 2026-09-06, so that midnight
      // does not exist. The answer used to be 23:00 on the 5th — the wrong day.
      const instant = wallClockToInstant(
        { year: 2026, month: 9, day: 6 },
        SANTIAGO,
      );
      expect(instant.toISOString()).toBe("2026-09-06T04:00:00.000Z");
      expect(clockIn(instant, SANTIAGO)).toBe("2026-09-06 01:00");

      // Havana skips its midnight on 2026-03-08 the same way.
      const havana = wallClockToInstant(
        { year: 2026, month: 3, day: 8 },
        HAVANA,
      );
      expect(havana.toISOString()).toBe("2026-03-08T05:00:00.000Z");
      expect(clockIn(havana, HAVANA)).toBe("2026-03-08 01:00");
    });
  });

  describe("a wall time the clocks read twice", () => {
    it("is the first of the two", () => {
      // 2026-10-25 02:30 Paris happens at 00:30Z (still UTC+2) and again at
      // 01:30Z (now UTC+1). The answer is the first: a later wall time then
      // never maps to an earlier instant, and a day whose midnight repeats
      // begins at its first midnight rather than an hour into itself.
      const instant = wallClockToInstant(
        { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
        PARIS,
      );
      expect(instant.toISOString()).toBe("2026-10-25T00:30:00.000Z");
      // Both candidates really do read 02:30 in Paris — the ambiguity is real,
      // not an artifact of the conversion.
      expect(clockIn(instant, PARIS)).toBe("2026-10-25 02:30");
      expect(clockIn(new Date("2026-10-25T01:30:00Z"), PARIS)).toBe(
        "2026-10-25 02:30",
      );
    });

    it("is the first of the two west of Greenwich as well", () => {
      const instant = wallClockToInstant(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        NEW_YORK,
      );
      expect(instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
      expect(clockIn(instant, NEW_YORK)).toBe("2026-11-01 01:30");
    });

    it("is the first of the two when midnight itself repeats", () => {
      // Havana goes back 01:00 → 00:00 on 2026-11-01, so that day has two
      // midnights: 04:00Z and 05:00Z. The day began at the first.
      const instant = wallClockToInstant(
        { year: 2026, month: 11, day: 1 },
        HAVANA,
      );
      expect(instant.toISOString()).toBe("2026-11-01T04:00:00.000Z");
      expect(clockIn(new Date("2026-11-01T05:00:00Z"), HAVANA)).toBe(
        "2026-11-01 00:00",
      );
    });

    it("is the first of the two when the clocks go back half an hour", () => {
      // Lord Howe's DST shift is 30 minutes, so its overlap is half an hour.
      const instant = wallClockToInstant(
        { year: 2026, month: 4, day: 5, hour: 1, minute: 45 },
        LORD_HOWE,
      );
      expect(instant.toISOString()).toBe("2026-04-04T14:45:00.000Z");
      expect(clockIn(new Date("2026-04-04T15:15:00Z"), LORD_HOWE)).toBe(
        "2026-04-05 01:45",
      );
    });
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

// The rule itself, rather than a handful of cities: away from a clock change
// the answer reads exactly what was asked for and is the first instant that
// does; inside a gap it is carried forward by exactly the amount the clocks
// skipped. The transitions are found by asking `Intl`, not by restating the
// conversion, so this checks the contract rather than the implementation.
describe("the instant a clock in the zone reads", () => {
  const ZONES = [
    PARIS, // north, east of Greenwich
    NEW_YORK, // north, west of Greenwich
    HAVANA, // switches at midnight, west
    SANTIAGO, // southern hemisphere, switches at midnight
    LORD_HOWE, // southern, half-hour shift on a half-hour base offset
    TOKYO, // no DST at all
    "UTC",
  ];
  const ORDINARY_DAY = { year: 2026, month: 6, day: 15 };

  for (const zone of ZONES) {
    test(`holds across every 2026 clock change in ${zone}`, () => {
      const changes = transitions(zone, 2026);
      expect(changes.length).toBe(zone === TOKYO || zone === "UTC" ? 0 : 2);

      const walk = [
        ...changes.map((change) => {
          const { year, month, day } = zoneWallClock(change.instant, zone);
          return { day: { year, month, day }, change };
        }),
        { day: ORDINARY_DAY, change: undefined },
      ];

      const failures: string[] = [];
      for (const { day, change } of walk) {
        for (let quarter = 0; quarter < 24; quarter++) {
          const w = {
            ...day,
            hour: Math.floor(quarter / 4),
            minute: (quarter % 4) * 15,
            second: 0,
          };
          const asked = asNumber(w);
          const instant = wallClockToInstant(w, zone);
          const earlier = new Date(instant.getTime() - 1000);
          const reads = asNumber(zoneWallClock(instant, zone));
          const asking = `${zone} ${clockOf(w)} → ${instant.toISOString()}`;

          if (reads === asked) {
            // It exists, so this must be the first instant that reads it.
            if (asNumber(zoneWallClock(earlier, zone)) >= asked) {
              failures.push(
                `${asking}, but a second earlier already reads ${clockIn(earlier, zone)}`,
              );
            }
          } else if (change !== undefined && change.after > change.before) {
            // It was skipped, so it must come back carried forward by the jump.
            if (reads - asked !== change.after - change.before) {
              failures.push(
                `${asking}, which reads ${clockIn(instant, zone)} — not ${clockOf(w)} carried forward by the ${(change.after - change.before) / 60000} minutes the clocks skipped`,
              );
            }
          } else {
            failures.push(
              `${asking}, which reads ${clockIn(instant, zone)} — not what was asked, and no clock change that day explains it`,
            );
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});

describe("startOfLocalDay", () => {
  const at = (iso: string) => new Date(iso);

  test("UTC: midnight UTC", () => {
    expect(
      startOfLocalDay(at("2026-09-18T15:30:00Z"), "UTC").toISOString(),
    ).toBe("2026-09-18T00:00:00.000Z");
  });

  test("east of Greenwich: today there may still be yesterday in UTC", () => {
    // 23:30 UTC on the 17th is 08:30 on the 18th in Tokyo (UTC+9).
    expect(
      startOfLocalDay(at("2026-09-17T23:30:00Z"), TOKYO).toISOString(),
    ).toBe("2026-09-17T15:00:00.000Z");
  });

  test("west of Greenwich: today there may already be tomorrow in UTC", () => {
    // 02:00 UTC on the 19th is 22:00 on the 18th in New York (EDT, UTC-4).
    expect(
      startOfLocalDay(at("2026-09-19T02:00:00Z"), NEW_YORK).toISOString(),
    ).toBe("2026-09-18T04:00:00.000Z");
  });

  test("the day clocks spring forward: midnight still on the old offset", () => {
    // New York switches EST → EDT at 02:00 on 2026-03-08. Midnight was EST (UTC-5).
    expect(
      startOfLocalDay(at("2026-03-08T18:00:00Z"), NEW_YORK).toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
  });

  test("the day clocks fall back: midnight still on the old offset", () => {
    // New York switches EDT → EST at 02:00 on 2026-11-01. Midnight was EDT (UTC-4).
    expect(
      startOfLocalDay(at("2026-11-01T18:00:00Z"), NEW_YORK).toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  test("a zone whose clocks jump over midnight: the day begins at 01:00", () => {
    // Santiago springs forward at 00:00 → 01:00 on 2026-09-06 (UTC-4 → UTC-3).
    expect(
      startOfLocalDay(at("2026-09-06T15:00:00Z"), SANTIAGO).toISOString(),
    ).toBe("2026-09-06T04:00:00.000Z");
  });

  test("a zone whose clocks fall back onto midnight: the day begins at the first of the two", () => {
    // Havana goes back 01:00 → 00:00 on 2026-11-01, so midnight happens twice.
    // The day began at the first; the second is an hour into it.
    expect(
      startOfLocalDay(at("2026-11-01T18:00:00Z"), HAVANA).toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  test("whatever the zone, the start is the first instant of the local day", () => {
    const dateIn = (d: Date, zone: string) => {
      const { year, month, day } = zoneWallClock(d, zone);
      return `${year}-${month}-${day}`;
    };
    const failures: string[] = [];
    for (const zone of [SANTIAGO, HAVANA, NEW_YORK, TOKYO, LORD_HOWE]) {
      for (const now of ["2026-09-06T12:00:00Z", "2026-11-01T12:00:00Z"]) {
        const start = startOfLocalDay(at(now), zone);
        const earlier = new Date(start.getTime() - 1000);
        if (dateIn(start, zone) === dateIn(earlier, zone)) {
          failures.push(
            `${zone} on ${now}: ${start.toISOString()} is not the first instant of ${dateIn(start, zone)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("an unknown time zone throws", () => {
    expect(() => startOfLocalDay(new Date(), "Not/AZone")).toThrow(RangeError);
  });
});

describe("zoneWallClock", () => {
  it("reads back what a clock in the zone shows", () => {
    expect(zoneWallClock(new Date("2026-08-09T08:00:00Z"), PARIS)).toEqual({
      year: 2026,
      month: 8,
      day: 9,
      hour: 10,
      minute: 0,
      second: 0,
    });
    // Midnight comes back as hour 0, never as 24.
    expect(zoneWallClock(new Date("2026-08-08T22:00:00Z"), PARIS).hour).toBe(0);
  });

  it("is the inverse of wallClockToInstant away from a clock change", () => {
    const w = {
      year: 2026,
      month: 8,
      day: 9,
      hour: 10,
      minute: 30,
      second: 15,
    };
    for (const zone of [PARIS, NEW_YORK, TOKYO, LORD_HOWE, "UTC"]) {
      expect(zoneWallClock(wallClockToInstant(w, zone), zone)).toEqual(w);
    }
  });

  it("throws on a zone Intl cannot resolve rather than reporting UTC", () => {
    expect(() => zoneWallClock(new Date(), "Mars/Olympus_Mons")).toThrow();
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

/** What a clock in `zone` reads at `instant`, for asserting the DST resolutions. */
function clockIn(instant: Date, zone: string): string {
  const { year, month, day, hour, minute } = zoneWallClock(instant, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}`;
}

/** A wall clock as one number, so two readings can be ordered. */
function asNumber(w: Required<WallClock>): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
}

/** A wall clock the way a failure message reads it. */
function clockOf(w: Required<WallClock>): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}`;
}

/**
 * Every instant at which `zone` changed its offset during `year`, with the
 * offsets either side — found by asking `Intl` rather than by listing rules:
 * walk the year a day at a time, then bisect the day the offset changed down to
 * the second.
 */
function transitions(
  zone: string,
  year: number,
): { instant: Date; before: number; after: number }[] {
  const SECOND_MS = 1000;
  const DAY_MS = 24 * 60 * 60 * SECOND_MS;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const found: { instant: Date; before: number; after: number }[] = [];

  let previous = zoneOffsetMs(new Date(start), zone);
  for (let t = start + DAY_MS; t < end; t += DAY_MS) {
    const offset = zoneOffsetMs(new Date(t), zone);
    if (offset === previous) continue;

    // The change is in (lo, hi]: lo still reads the old offset, hi the new.
    let lo = t - DAY_MS;
    let hi = t;
    while (hi - lo > SECOND_MS) {
      const mid = lo + Math.floor((hi - lo) / 2 / SECOND_MS) * SECOND_MS;
      if (mid === lo) break;
      if (zoneOffsetMs(new Date(mid), zone) === previous) lo = mid;
      else hi = mid;
    }
    found.push({ instant: new Date(hi), before: previous, after: offset });
    previous = offset;
  }
  return found;
}
