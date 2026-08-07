import { describe, expect, test } from "bun:test";
import { describeEventDate, eventDateProjection } from "./describe";
import { type EventDate, EventDateSchema } from "./event-date";

function eventDate(input: Record<string, unknown>): EventDate {
  return EventDateSchema.parse(input);
}

function sentence(rule: Record<string, unknown>, startsAt = "2026-08-13T20:00:00Z"): string {
  return describeEventDate(
    eventDate({ kind: "recurring", startsAt, rule }),
  );
}

describe("describeEventDate", () => {
  test("weekly", () => {
    expect(sentence({ freq: "weekly", byWeekday: ["th"] })).toBe(
      "every Thursday",
    );
    expect(sentence({ freq: "weekly", byWeekday: ["mo", "th"] })).toBe(
      "every Monday and Thursday",
    );
    expect(
      sentence({ freq: "weekly", interval: 2, byWeekday: ["tu"] }),
    ).toBe("every 2 weeks on Tuesday");
    expect(sentence({ freq: "weekly" })).toBe("every week");
  });

  test("daily", () => {
    expect(sentence({ freq: "daily" })).toBe("every day");
    expect(sentence({ freq: "daily", interval: 3 })).toBe("every 3 days");
  });

  test("monthly", () => {
    expect(
      sentence({ freq: "monthly", nthWeekday: { nth: 1, weekday: "fr" } }),
    ).toBe("first Friday of the month");
    expect(
      sentence({ freq: "monthly", nthWeekday: { nth: -1, weekday: "su" } }),
    ).toBe("last Sunday of the month");
    expect(sentence({ freq: "monthly", byMonthDay: [15, 1] })).toBe(
      "on the 1st and 15th of the month",
    );
    expect(sentence({ freq: "monthly" })).toBe("every month");
  });

  test("yearly names the anchor's month", () => {
    expect(sentence({ freq: "yearly" })).toBe("every year in August");
  });

  test("appends the series' ending", () => {
    expect(
      sentence({
        freq: "weekly",
        byWeekday: ["th"],
        until: "2026-09-03T00:00:00Z",
      }),
    ).toBe("every Thursday, until 3 Sep 2026");
    expect(sentence({ freq: "weekly", byWeekday: ["th"], count: 6 })).toBe(
      "every Thursday, 6 times",
    );
  });

  test("a one-off reads as its date", () => {
    expect(
      describeEventDate(
        eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" }),
      ),
    ).toBe("on 13 Aug 2026");
  });
});

describe("eventDateProjection", () => {
  test("a one-off projects no series meaning", () => {
    const projection = eventDateProjection(
      eventDate({
        kind: "once",
        startsAt: "2026-08-13T20:00:00Z",
        endsAt: "2026-08-13T23:00:00Z",
      }),
    );
    expect(projection.recurring).toBe(false);
    expect(projection.recurrenceLabel).toBeNull();
    expect(projection.allDay).toBe(false);
    expect(projection.startsAt.toISOString()).toBe("2026-08-13T20:00:00.000Z");
    expect(projection.endsAt?.toISOString()).toBe("2026-08-13T23:00:00.000Z");
  });

  test("an absent endsAt projects as null, not undefined", () => {
    const projection = eventDateProjection(
      eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" }),
    );
    expect(projection.endsAt).toBeNull();
  });

  test("prefers the page's own words for the label", () => {
    const projection = eventDateProjection(
      eventDate({
        kind: "recurring",
        startsAt: "2026-08-13T20:00:00Z",
        label: "Techno Thursdays, weekly",
        rule: { freq: "weekly", byWeekday: ["th"] },
      }),
    );
    expect(projection.recurring).toBe(true);
    expect(projection.recurrenceLabel).toBe("Techno Thursdays, weekly");
  });

  test("falls back to the generated sentence when the page had none", () => {
    const projection = eventDateProjection(
      eventDate({
        kind: "recurring",
        startsAt: "2026-08-13T20:00:00Z",
        rule: { freq: "weekly", byWeekday: ["th"] },
      }),
    );
    expect(projection.recurrenceLabel).toBe("every Thursday");
  });

  test("a blank label means 'I have none', not an empty column", () => {
    const projection = eventDateProjection(
      eventDate({
        kind: "recurring",
        startsAt: "2026-08-13T20:00:00Z",
        label: "   ",
        rule: { freq: "weekly", byWeekday: ["th"] },
      }),
    );
    expect(projection.recurrenceLabel).toBe("every Thursday");
  });
});
