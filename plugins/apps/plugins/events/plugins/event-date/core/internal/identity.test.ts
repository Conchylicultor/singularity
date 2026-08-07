import { describe, expect, test } from "bun:test";
import { type EventDate, EventDateSchema } from "./event-date";
import { eventDateIdentityKey } from "./identity";

// Identity stability is the whole point of this file, so it is the whole point
// of these tests: an identity that moves means a duplicate row per refresh and
// the original buried as disappeared.

function eventDate(input: Record<string, unknown>): EventDate {
  return EventDateSchema.parse(input);
}

describe("eventDateIdentityKey — once", () => {
  test("is the UTC day key, byte-identical to the engine's current derivation", () => {
    // Must equal `startsAtDateKey` in
    // plugins/apps/plugins/events/plugins/refresh/server/internal/external-id.ts
    // — that equality is what stops the deploy duplicating every existing row.
    const startsAt = new Date("2026-08-13T22:30:00Z");
    const legacy = new Date(startsAt.getTime()).toISOString().slice(0, 10);
    expect(eventDateIdentityKey(eventDate({ kind: "once", startsAt }))).toBe(
      legacy,
    );
    expect(legacy).toBe("2026-08-13");
  });

  test("ignores the time of day — a door time nudged by 30 min is the same party", () => {
    const early = eventDate({ kind: "once", startsAt: "2026-08-13T21:00:00Z" });
    const late = eventDate({ kind: "once", startsAt: "2026-08-13T21:30:00Z" });
    expect(eventDateIdentityKey(early)).toBe(eventDateIdentityKey(late));
  });

  test("a different day is a different event", () => {
    const a = eventDate({ kind: "once", startsAt: "2026-08-13T20:00:00Z" });
    const b = eventDate({ kind: "once", startsAt: "2026-08-20T20:00:00Z" });
    expect(eventDateIdentityKey(a)).not.toBe(eventDateIdentityKey(b));
  });

  test("throws on an invalid date rather than minting a wrong id", () => {
    expect(() =>
      eventDateIdentityKey({ kind: "once", startsAt: new Date("nonsense") }),
    ).toThrow();
  });
});

describe("eventDateIdentityKey — recurring", () => {
  const rule = { freq: "weekly", byWeekday: ["th"] };

  test("is independent of the anchor — a drifting series stays one row", () => {
    const thisWeek = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule,
    });
    const nextMonth = eventDate({
      kind: "recurring",
      startsAt: "2026-09-17T20:00:00Z",
      rule,
    });
    expect(eventDateIdentityKey(thisWeek)).toBe(
      eventDateIdentityKey(nextMonth),
    );
    expect(eventDateIdentityKey(thisWeek)).toBe("weekly:1:wd=th");
  });

  test("is independent of endsAt, allDay and the page's label", () => {
    const bare = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule,
    });
    const dressed = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      endsAt: "2026-08-14T04:00:00Z",
      allDay: false,
      label: "Techno Thursdays",
      rule,
    });
    expect(eventDateIdentityKey(dressed)).toBe(eventDateIdentityKey(bare));
  });

  test("member order cannot change the key", () => {
    const one = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule: { freq: "weekly", byWeekday: ["th", "mo"] },
    });
    const other = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule: { freq: "weekly", byWeekday: ["mo", "th", "mo"] },
    });
    expect(eventDateIdentityKey(one)).toBe("weekly:1:wd=mo,th");
    expect(eventDateIdentityKey(other)).toBe(eventDateIdentityKey(one));
  });

  test("month-day order cannot change the key either", () => {
    const key = eventDateIdentityKey(
      eventDate({
        kind: "recurring",
        startsAt: "2026-08-15T20:00:00Z",
        rule: { freq: "monthly", byMonthDay: [15, 1] },
      }),
    );
    expect(key).toBe("monthly:1:md=1,15");
  });

  test("interval, nthWeekday, until and count are all in the signature", () => {
    expect(
      eventDateIdentityKey(
        eventDate({
          kind: "recurring",
          startsAt: "2026-08-07T20:00:00Z",
          rule: {
            freq: "monthly",
            interval: 2,
            nthWeekday: { nth: -1, weekday: "fr" },
            until: "2027-01-31T00:00:00Z",
          },
        }),
      ),
    ).toBe("monthly:2:nth=-1fr:until=2027-01-31");

    expect(
      eventDateIdentityKey(
        eventDate({
          kind: "recurring",
          startsAt: "2026-08-13T20:00:00Z",
          rule: { freq: "weekly", byWeekday: ["th"], count: 6 },
        }),
      ),
    ).toBe("weekly:1:wd=th:count=6");
  });

  test("a series that ends is not the same series as one that runs forever", () => {
    const forever = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule,
    });
    const bounded = eventDate({
      kind: "recurring",
      startsAt: "2026-08-13T20:00:00Z",
      rule: { ...rule, until: "2026-12-31T00:00:00Z" },
    });
    expect(eventDateIdentityKey(bounded)).not.toBe(
      eventDateIdentityKey(forever),
    );
  });

  test("cannot collide with a once key", () => {
    const recurringKey = eventDateIdentityKey(
      eventDate({
        kind: "recurring",
        startsAt: "2026-08-13T20:00:00Z",
        rule,
      }),
    );
    expect(recurringKey).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("an omitted interval and an explicit 1 are the SAME series", () => {
    // The wire may state "every week" either way. If these keys differed, a page
    // that started spelling `interval: 1` explicitly would mint a duplicate row
    // and bury the original — which is exactly the failure identity exists to
    // prevent, arriving from a change the venue did not even make.
    const key = (rule: unknown) =>
      eventDateIdentityKey(
        EventDateSchema.parse({
          kind: "recurring",
          startsAt: "2026-08-13T21:00:00Z",
          rule,
        }),
      );
    expect(key({ freq: "weekly", byWeekday: ["th"] })).toBe(
      key({ freq: "weekly", interval: 1, byWeekday: ["th"] }),
    );
    expect(key({ freq: "weekly", byWeekday: ["th"] })).not.toBe(
      key({ freq: "weekly", interval: 2, byWeekday: ["th"] }),
    );
  });
});
