import { describe, expect, test } from "bun:test";
import { type EventDate, EventDateSchema } from "./event-date";
import {
  MAX_EXPANDED_OCCURRENCES,
  expandEventDate,
  nextOccurrence,
  resolveAnchor,
} from "./expand";

// Every anchor below is a real weekday: 2026-08-13 is a Thursday, 2026-08-11 a
// Tuesday, 2026-08-01 a Saturday. The assertions are written as day keys because
// the interesting behaviour is calendar behaviour — the time of day is asserted
// separately, once.

function eventDate(input: Record<string, unknown>): EventDate {
  return EventDateSchema.parse(input);
}

function recurring(rule: Record<string, unknown>, over: Record<string, unknown> = {}): EventDate {
  return eventDate({
    kind: "recurring",
    startsAt: "2026-08-13T20:00:00Z",
    rule,
    ...over,
  });
}

function days(date: EventDate, from: string, until: string, max?: number): string[] {
  return expandEventDate(date, {
    from: new Date(from),
    until: new Date(until),
    ...(max === undefined ? {} : { max }),
  }).map((o) => o.startsAt.toISOString().slice(0, 10));
}

describe("expandEventDate — once", () => {
  test("yields the single occurrence when it falls in the window", () => {
    const date = eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" });
    expect(days(date, "2026-08-01", "2026-08-31")).toEqual(["2026-08-13"]);
  });

  test("yields nothing outside the window", () => {
    const date = eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" });
    expect(days(date, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  test("a multi-day event overlapping the window is in it", () => {
    const date = eventDate({
      kind: "once",
      startsAt: "2026-08-10T10:00:00Z",
      endsAt: "2026-08-16T18:00:00Z",
    });
    expect(days(date, "2026-08-14", "2026-08-15")).toEqual(["2026-08-10"]);
  });
});

describe("expandEventDate — recurrence", () => {
  test("walks across a month boundary", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"] });
    expect(days(date, "2026-08-13", "2026-09-15")).toEqual([
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
      "2026-09-03",
      "2026-09-10",
    ]);
  });

  test("interval > 1 skips the intervening periods", () => {
    const date = recurring({
      freq: "weekly",
      interval: 2,
      byWeekday: ["th"],
    });
    expect(days(date, "2026-08-13", "2026-10-01")).toEqual([
      "2026-08-13",
      "2026-08-27",
      "2026-09-10",
      "2026-09-24",
    ]);
  });

  test("daily with an interval steps whole days", () => {
    const date = recurring({ freq: "daily", interval: 3 });
    expect(days(date, "2026-08-13", "2026-08-26")).toEqual([
      "2026-08-13",
      "2026-08-16",
      "2026-08-19",
      "2026-08-22",
      "2026-08-25",
    ]);
  });

  test("weekly with several weekdays emits them in week order", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th", "mo"] });
    expect(days(date, "2026-08-13", "2026-08-28")).toEqual([
      "2026-08-13",
      "2026-08-17",
      "2026-08-20",
      "2026-08-24",
      "2026-08-27",
    ]);
  });

  test("nthWeekday: the first Friday of each month", () => {
    const date = recurring(
      { freq: "monthly", nthWeekday: { nth: 1, weekday: "fr" } },
      { startsAt: "2026-08-07T20:00:00Z" },
    );
    expect(days(date, "2026-08-01", "2026-10-31")).toEqual([
      "2026-08-07",
      "2026-09-04",
      "2026-10-02",
    ]);
  });

  test("nthWeekday: nth -1 is the LAST such weekday, whatever the month's length", () => {
    const date = recurring(
      { freq: "monthly", nthWeekday: { nth: -1, weekday: "su" } },
      { startsAt: "2026-08-30T18:00:00Z" },
    );
    expect(days(date, "2026-08-01", "2026-10-31")).toEqual([
      "2026-08-30",
      "2026-09-27",
      "2026-10-25",
    ]);
  });

  test("nthWeekday: a month without a 5th occurrence contributes nothing", () => {
    const date = recurring(
      { freq: "monthly", nthWeekday: { nth: 5, weekday: "mo" } },
      { startsAt: "2026-08-31T20:00:00Z" },
    );
    // Aug 2026 has five Mondays (3, 10, 17, 24, 31); Sep and Oct have four.
    expect(days(date, "2026-08-01", "2026-12-01")).toEqual([
      "2026-08-31",
      "2026-11-30",
    ]);
  });

  test("byMonthDay: a day the month does not have is skipped, not clamped", () => {
    const date = recurring(
      { freq: "monthly", byMonthDay: [31] },
      { startsAt: "2026-01-31T20:00:00Z" },
    );
    expect(days(date, "2026-01-01", "2026-06-30")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
  });

  test("monthly with no qualifier repeats the anchor's day of the month", () => {
    const date = recurring(
      { freq: "monthly" },
      { startsAt: "2026-01-31T20:00:00Z" },
    );
    expect(days(date, "2026-01-01", "2026-06-30")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
  });

  test("yearly repeats the anchor's date, skipping years it does not exist in", () => {
    const date = recurring(
      { freq: "yearly" },
      { startsAt: "2024-02-29T12:00:00Z" },
    );
    expect(days(date, "2024-01-01", "2029-12-31")).toEqual([
      "2024-02-29",
      "2028-02-29",
    ]);
  });

  test("an anchor that does not itself match the rule is the series' floor, not a member", () => {
    // The model anchored "every Thursday" on a Tuesday. The Thursday of that
    // same week is the first occurrence; the Tuesday is not one at all.
    const date = recurring(
      { freq: "weekly", byWeekday: ["th"] },
      { startsAt: "2026-08-11T20:00:00Z" },
    );
    expect(days(date, "2026-08-01", "2026-08-31")).toEqual([
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
    ]);
  });
});

describe("expandEventDate — bounds", () => {
  test("until ends the series, inclusive of the day it names", () => {
    const date = recurring({
      freq: "weekly",
      byWeekday: ["th"],
      until: "2026-09-03T23:59:59Z",
    });
    expect(days(date, "2026-08-01", "2026-12-31")).toEqual([
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
      "2026-09-03",
    ]);
  });

  test("count ends the series after that many occurrences", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"], count: 3 });
    expect(days(date, "2026-08-01", "2026-12-31")).toEqual([
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
    ]);
  });

  test("count is a property of the SERIES, not of the window asked for", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"], count: 3 });
    // Asking only about September must not restart the count there.
    expect(days(date, "2026-09-01", "2026-12-31")).toEqual([]);
  });

  test("max caps the result", () => {
    const date = recurring({ freq: "daily" });
    expect(days(date, "2026-08-13", "2026-12-31", 5)).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  test("an unbounded rule over a huge window stops at MAX_EXPANDED_OCCURRENCES", () => {
    const date = recurring({ freq: "daily" });
    const out = expandEventDate(date, {
      from: new Date("2026-08-13"),
      until: new Date("2126-08-13"),
    });
    expect(out).toHaveLength(MAX_EXPANDED_OCCURRENCES);
  });

  test("an invalid window bound throws rather than yielding nothing", () => {
    const date = recurring({ freq: "daily" });
    expect(() =>
      expandEventDate(date, {
        from: new Date("nonsense"),
        until: new Date("2026-12-31"),
      }),
    ).toThrow();
  });
});

describe("expandEventDate — purity", () => {
  test("occurrences carry the anchor's time of day and duration", () => {
    const date = recurring(
      { freq: "weekly", byWeekday: ["th"] },
      {
        startsAt: "2026-08-13T23:00:00Z",
        endsAt: "2026-08-14T05:00:00Z",
      },
    );
    const [, second] = expandEventDate(date, {
      from: new Date("2026-08-13"),
      until: new Date("2026-08-31"),
    });
    expect(second?.startsAt.toISOString()).toBe("2026-08-20T23:00:00.000Z");
    expect(second?.endsAt?.toISOString()).toBe("2026-08-21T05:00:00.000Z");
  });

  test("no stated end stays null on every occurrence", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"] });
    const out = expandEventDate(date, {
      from: new Date("2026-08-13"),
      until: new Date("2026-08-31"),
    });
    expect(out.every((o) => o.endsAt === null)).toBe(true);
  });

  test("the same input expands identically twice and mutates nothing", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"] });
    const anchorBefore = date.startsAt.getTime();
    const first = days(date, "2026-08-13", "2026-09-30");
    const second = days(date, "2026-08-13", "2026-09-30");
    expect(second).toEqual(first);
    expect(date.startsAt.getTime()).toBe(anchorBefore);
  });
});

describe("nextOccurrence", () => {
  test("finds the next member of a live series", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"] });
    const result = nextOccurrence(date, new Date("2026-08-21T00:00:00Z"));
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");
    expect(result.occurrence.startsAt.toISOString()).toBe(
      "2026-08-27T20:00:00.000Z",
    );
  });

  test("normalizes a misplaced anchor onto the rule", () => {
    const date = recurring(
      { freq: "weekly", byWeekday: ["th"] },
      { startsAt: "2026-08-11T20:00:00Z" },
    );
    const result = nextOccurrence(date, new Date("2026-08-11T00:00:00Z"));
    if (!result.found) throw new Error("expected an occurrence");
    expect(result.occurrence.startsAt.toISOString()).toBe(
      "2026-08-13T20:00:00.000Z",
    );
  });

  test("a series whose count is spent reports exhausted, not null", () => {
    const date = recurring({ freq: "weekly", byWeekday: ["th"], count: 2 });
    const result = nextOccurrence(date, new Date("2026-09-01T00:00:00Z"));
    expect(result).toEqual({ found: false, reason: "exhausted" });
  });

  test("a series past its until reports exhausted", () => {
    const date = recurring({
      freq: "weekly",
      byWeekday: ["th"],
      until: "2026-08-27T00:00:00Z",
    });
    const result = nextOccurrence(date, new Date("2026-09-01T00:00:00Z"));
    expect(result).toEqual({ found: false, reason: "exhausted" });
  });

  test("a rule that can never fire reports exhausted rather than spinning", () => {
    // Every 7th day from a Thursday anchor is always a Thursday; filtering to
    // Monday leaves the series with no reachable member at all.
    const date = recurring({
      freq: "daily",
      interval: 7,
      byWeekday: ["mo"],
    });
    expect(nextOccurrence(date, new Date("2026-08-13T00:00:00Z"))).toEqual({
      found: false,
      reason: "exhausted",
    });
  });

  test("a one-off already past is exhausted; one still ahead is found", () => {
    const date = eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" });
    expect(nextOccurrence(date, new Date("2026-08-14T00:00:00Z"))).toEqual({
      found: false,
      reason: "exhausted",
    });
    expect(nextOccurrence(date, new Date("2026-08-01T00:00:00Z")).found).toBe(
      true,
    );
  });
});

describe("resolveAnchor", () => {
  const PAST = "2026-08-13T21:00:00Z";
  const NOW = new Date("2026-09-01T00:00:00Z");

  test("a one-off in the past still resolves — it does not expire", () => {
    // The regression this pins is data loss, not a wrong date: an unresolved
    // anchor drops the event from the write plan AND from the seen-set, so
    // `markEventsDisappeared` buries every past event of the source, including
    // the hand-typed ones a `manual` source echoes back.
    const date = EventDateSchema.parse({ kind: "once", startsAt: PAST });
    const resolved = resolveAnchor(date, NOW);
    expect(resolved.found).toBe(true);
    expect(resolved.found && resolved.occurrence.startsAt.toISOString()).toBe(
      "2026-08-13T21:00:00.000Z",
    );
    // ...whereas asking for the NEXT one is honestly `exhausted`. Both are
    // right; conflating them is the bug.
    expect(nextOccurrence(date, NOW).found).toBe(false);
  });

  test("a live series re-anchors forward to its next occurrence", () => {
    const date = EventDateSchema.parse({
      kind: "recurring",
      startsAt: PAST,
      rule: { freq: "weekly", byWeekday: ["th"] },
    });
    const resolved = resolveAnchor(date, NOW);
    expect(resolved.found).toBe(true);
    expect(
      resolved.found && resolved.occurrence.startsAt.toISOString().slice(0, 10),
    ).toBe("2026-09-03");
  });

  test("a spent series is exhausted — it really is over", () => {
    const date = EventDateSchema.parse({
      kind: "recurring",
      startsAt: PAST,
      rule: { freq: "weekly", byWeekday: ["th"], until: "2026-08-20" },
    });
    expect(resolveAnchor(date, NOW).found).toBe(false);
  });
});
