import { describe, expect, it } from "bun:test";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import { sessionDate } from "./session-date";

const ROW = "session test";

describe("sessionDate", () => {
  it("reads the published times as Paris wall clock, not as UTC", () => {
    // The live Nelson's session: 14:30–18:00 on 2026-09-10. September is UTC+2,
    // so reading these as UTC would put the whole afternoon two hours early.
    const { date } = sessionDate("2026-09-10", "14:30:00", "18:00:00", ROW);
    expect(date.startsAt.toISOString()).toBe("2026-09-10T12:30:00.000Z");
    expect(date.endsAt?.toISOString()).toBe("2026-09-10T16:00:00.000Z");
  });

  it("uses winter time in winter", () => {
    const { date } = sessionDate("2026-01-29", "14:00:00", "18:00:00", ROW);
    expect(date.startsAt.toISOString()).toBe("2026-01-29T13:00:00.000Z");
  });

  it("reports nothing rolled over for an ordinary afternoon", () => {
    expect(
      sessionDate("2026-09-10", "14:30:00", "18:00:00", ROW).rolledOverMidnight,
    ).toBe(false);
  });

  it("rolls an end at or before the start into the next day", () => {
    const { date, rolledOverMidnight } = sessionDate(
      "2026-06-18",
      "22:00:00",
      "01:00:00",
      ROW,
    );
    expect(rolledOverMidnight).toBe(true);
    expect(date.endsAt?.toISOString()).toBe("2026-06-18T23:00:00.000Z");
  });

  it("rolls across a month boundary too", () => {
    const { date } = sessionDate("2026-01-31", "23:00:00", "02:00:00", ROW);
    expect(date.endsAt?.toISOString()).toBe("2026-02-01T01:00:00.000Z");
  });

  it("throws on a date it cannot read, rather than skipping the session", () => {
    // The load-bearing property: `extract` returns the source's FULL set, so a
    // silently dropped row is one the engine stamps `disappearedAt` on.
    expect(() =>
      sessionDate("10/09/2026", "14:30:00", "18:00:00", ROW),
    ).toThrow(NonRetryableError);
  });

  it("throws on a time it cannot read", () => {
    expect(() => sessionDate("2026-09-10", "14h30", "18:00:00", ROW)).toThrow(
      NonRetryableError,
    );
  });

  it("throws on a date that does not exist", () => {
    expect(() =>
      sessionDate("2026-02-30", "14:30:00", "18:00:00", ROW),
    ).toThrow(NonRetryableError);
  });

  it("throws on an impossible time rather than rolling it over", () => {
    expect(() =>
      sessionDate("2026-09-10", "25:00:00", "26:00:00", ROW),
    ).toThrow(NonRetryableError);
  });
});
