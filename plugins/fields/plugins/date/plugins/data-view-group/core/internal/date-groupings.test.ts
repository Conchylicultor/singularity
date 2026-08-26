import { describe, expect, it } from "bun:test";
import type {
  FieldValue,
  GroupBucket,
  GroupingPlanContext,
} from "@plugins/primitives/plugins/data-view/core";
import { buildDateGroupings } from "./date-groupings";

/**
 * Pinned "now": Wednesday 2026-05-13, local noon.
 *
 * A LOCAL literal, never `Date.UTC` — every boundary under test is a local
 * calendar boundary, so a UTC pin would silently test a different day for
 * anyone off Greenwich.
 *
 * The day is chosen so that **all fifteen Smart buckets are reachable at
 * once**: mid-week (so "Earlier this week" is not swallowed by "Yesterday"),
 * early enough in the month that the week after next still lands inside it (so
 * "Later this month" is non-empty), late enough that the previous week starts
 * after the 1st (so "Earlier this month" is non-empty), and in a month far
 * enough from both year edges that "Earlier this year" and "Later this year"
 * both exist.
 */
const NOW = new Date(2026, 4, 13, 12, 0).getTime();

/** Local noon of a calendar day — unambiguous under any DST transition. */
function at(year: number, month1: number, day: number, hour = 12, minute = 0) {
  return new Date(year, month1 - 1, day, hour, minute);
}

const GROUPINGS = buildDateGroupings("en-US");

function grouping(id: string) {
  const found = GROUPINGS.find((g) => g.id === id);
  if (!found) throw new Error(`no such grouping: ${id}`);
  return found;
}

/** A plan context with the pinned clock; the date groupings read only `now`. */
function ctx(now = NOW): GroupingPlanContext {
  return {
    now,
    values: [],
    field: { id: "startsAt", label: "When", type: "date" },
  };
}

/** The bucket `id` files `value` in. Every case below passes a real date, so a
 *  `null` ("not a value I can bucket") is a test failure rather than an arm. */
function bucket(id: string, value: FieldValue, now = NOW): GroupBucket {
  const seen = grouping(id).plan(ctx(now))(value);
  if (seen === null) {
    throw new Error(`grouping "${id}" could not bucket ${String(value)}`);
  }
  return seen;
}

describe("the grouping set", () => {
  it("offers smart + the four fixed granularities, in menu order", () => {
    expect(GROUPINGS.map((g) => g.id)).toEqual([
      "smart",
      "day",
      "week",
      "month",
      "year",
    ]);
    expect(GROUPINGS.map((g) => g.label)).toEqual([
      "Smart",
      "Day",
      "Week",
      "Month",
      "Year",
    ]);
  });
});

describe("smart", () => {
  /** Every bucket, from the one pinned day. Wed 2026-05-13; weeks start Monday. */
  const cases: Array<[Date, string, string, number]> = [
    [at(2024, 6, 1), "older", "Older", -7],
    [at(2025, 12, 31), "older", "Older", -7],
    [at(2026, 1, 1), "earlier-year", "Earlier this year", -6],
    [at(2026, 3, 20), "earlier-year", "Earlier this year", -6],
    [at(2026, 4, 1), "last-month", "Last month", -5],
    [at(2026, 4, 30), "last-month", "Last month", -5],
    [at(2026, 5, 1), "earlier-month", "Earlier this month", -4],
    [at(2026, 5, 3), "earlier-month", "Earlier this month", -4],
    [at(2026, 5, 4), "last-week", "Last week", -3],
    [at(2026, 5, 10), "last-week", "Last week", -3],
    [at(2026, 5, 11), "earlier-week", "Earlier this week", -2],
    [at(2026, 5, 12), "yesterday", "Yesterday", -1],
    [at(2026, 5, 13), "today", "Today", 0],
    [at(2026, 5, 14), "tomorrow", "Tomorrow", 1],
    [at(2026, 5, 15), "this-week", "Later this week", 2],
    [at(2026, 5, 17), "this-week", "Later this week", 2],
    [at(2026, 5, 18), "next-week", "Next week", 3],
    [at(2026, 5, 24), "next-week", "Next week", 3],
    [at(2026, 5, 25), "this-month", "Later this month", 4],
    [at(2026, 5, 31), "this-month", "Later this month", 4],
    [at(2026, 6, 1), "next-month", "Next month", 5],
    [at(2026, 6, 30), "next-month", "Next month", 5],
    [at(2026, 7, 1), "later-year", "Later this year", 6],
    [at(2026, 12, 31), "later-year", "Later this year", 6],
    [at(2027, 1, 1), "later", "Later", 7],
  ];

  it("buckets every distance from the pinned day", () => {
    for (const [value, key, label, order] of cases) {
      expect({
        value: value.toDateString(),
        ...bucket("smart", value),
      }).toEqual({
        value: value.toDateString(),
        key,
        label,
        order,
      });
    }
  });

  it("covers all fifteen buckets, and each order is unique", () => {
    const keys = new Set(cases.map(([, key]) => key));
    expect(keys.size).toBe(15);
    const orders = new Set(cases.map(([, , , order]) => order));
    expect([...orders].sort((a, b) => a - b)).toEqual([
      -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("is exhaustive: 800 consecutive days around the pin all land somewhere", () => {
    const known = new Set(cases.map(([, key]) => key));
    for (let offset = -400; offset <= 400; offset++) {
      const value = new Date(2026, 4, 13 + offset, 12, 0);
      expect(known.has(bucket("smart", value).key)).toBe(true);
    }
  });

  it("breaks at local midnight, not at an elapsed-hours boundary", () => {
    expect(bucket("smart", at(2026, 5, 13, 23, 59)).key).toBe("today");
    expect(bucket("smart", new Date(2026, 4, 13, 23, 59, 59, 999)).key).toBe(
      "today",
    );
    expect(bucket("smart", at(2026, 5, 14, 0, 0)).key).toBe("tomorrow");
    expect(bucket("smart", new Date(2026, 4, 12, 23, 59, 59, 999)).key).toBe(
      "yesterday",
    );
  });

  it("breaks the week on the Sunday → Monday edge", () => {
    // Sun 2026-05-17 is the last day of the pinned week.
    expect(at(2026, 5, 17).getDay()).toBe(0);
    expect(at(2026, 5, 18).getDay()).toBe(1);
    expect(bucket("smart", at(2026, 5, 17, 23, 59)).key).toBe("this-week");
    expect(bucket("smart", at(2026, 5, 18, 0, 0)).key).toBe("next-week");
    // …and the past edge, one week back.
    expect(bucket("smart", at(2026, 5, 10, 23, 59)).key).toBe("last-week");
    expect(bucket("smart", at(2026, 5, 11, 0, 0)).key).toBe("earlier-week");
  });

  it("breaks the month on the last-day → 1st edge", () => {
    expect(bucket("smart", at(2026, 5, 31, 23, 59)).key).toBe("this-month");
    expect(bucket("smart", at(2026, 6, 1, 0, 0)).key).toBe("next-month");
    expect(bucket("smart", at(2026, 4, 30, 23, 59)).key).toBe("last-month");
    expect(bucket("smart", at(2026, 5, 1, 0, 0)).key).toBe("earlier-month");
  });

  it("breaks the year on the Dec 31 → Jan 1 edge", () => {
    expect(bucket("smart", at(2026, 12, 31, 23, 59)).key).toBe("later-year");
    expect(bucket("smart", at(2027, 1, 1, 0, 0)).key).toBe("later");
    expect(bucket("smart", at(2025, 12, 31, 23, 59)).key).toBe("older");
    expect(bucket("smart", at(2026, 1, 1, 0, 0)).key).toBe("earlier-year");
  });

  it("prefers the nearer reading when two are true", () => {
    // Pinned on Wed 2026-09-30: next week (Mon Oct 5 …) spills into October,
    // and "Next week" wins over "Next month" for those days.
    const endOfSeptember = new Date(2026, 8, 30, 12, 0).getTime();
    expect(at(2026, 9, 30).getDay()).toBe(3);
    expect(bucket("smart", at(2026, 10, 5), endOfSeptember).key).toBe(
      "next-week",
    );
    expect(bucket("smart", at(2026, 10, 12), endOfSeptember).key).toBe(
      "next-month",
    );
  });

  it("gives the same answer from either edge of the pinned day", () => {
    for (const clock of [
      new Date(2026, 4, 13, 0, 0, 0, 0).getTime(),
      new Date(2026, 4, 13, 23, 59, 59, 999).getTime(),
    ]) {
      expect(bucket("smart", at(2026, 5, 13), clock).key).toBe("today");
      expect(bucket("smart", at(2026, 5, 14), clock).key).toBe("tomorrow");
      expect(bucket("smart", at(2026, 5, 12), clock).key).toBe("yesterday");
    }
  });

  it("puts a whole DST-transition day in one bucket", () => {
    // Spring-forward Sundays in 2026: Mar 8 (US), Mar 29 (EU). Whichever one
    // is 23 hours long here, both of its edges are still ONE calendar day —
    // which epoch arithmetic (`t + 86_400_000`) would get wrong.
    for (const day of [8, 29]) {
      const early = bucket("smart", new Date(2026, 2, day, 0, 30));
      const late = bucket("smart", new Date(2026, 2, day, 23, 30));
      expect(late.key).toBe(early.key);
    }
  });
});

describe("day", () => {
  it("keys on the local calendar day and orders by its midnight", () => {
    expect(bucket("day", at(2026, 5, 20))).toEqual({
      key: "day:2026-05-20",
      label: "Wed, May 20",
      order: new Date(2026, 4, 20).getTime(),
    });
  });

  it("names the ±1 window relatively", () => {
    expect(bucket("day", at(2026, 5, 13)).label).toBe("Today");
    expect(bucket("day", at(2026, 5, 14)).label).toBe("Tomorrow");
    expect(bucket("day", at(2026, 5, 12)).label).toBe("Yesterday");
  });

  it("appends the year only when it differs from the year being viewed from", () => {
    expect(bucket("day", at(2025, 8, 21)).label).toBe("Thu, Aug 21, 2025");
    expect(bucket("day", at(2026, 8, 21)).label).toBe("Fri, Aug 21");
  });

  it("keeps a DST-transition day whole", () => {
    for (const day of [8, 29]) {
      expect(bucket("day", new Date(2026, 2, day, 0, 30)).key).toBe(
        bucket("day", new Date(2026, 2, day, 23, 30)).key,
      );
    }
  });
});

describe("week", () => {
  it("keys on the Monday of the value's week", () => {
    expect(bucket("week", at(2026, 5, 13))).toEqual({
      key: "week:2026-05-11",
      label: "Week of May 11",
      order: new Date(2026, 4, 11).getTime(),
    });
  });

  it("puts Sunday with the week before it, Monday with the week after", () => {
    expect(bucket("week", at(2026, 5, 17)).key).toBe("week:2026-05-11");
    expect(bucket("week", at(2026, 5, 18)).key).toBe("week:2026-05-18");
  });

  it("appends the year when the week starts in another one", () => {
    expect(bucket("week", at(2025, 12, 31)).label).toBe("Week of Dec 29, 2025");
  });

  it("keeps a week containing a DST transition whole", () => {
    // Spring-forward Sundays in 2026: Mar 8 (US), Mar 29 (EU). Each is the last
    // day of its Monday-started week AND only 23 hours long, so a week walked by
    // epoch arithmetic would break one day early.
    for (const sundayDate of [8, 29]) {
      const sunday = new Date(2026, 2, sundayDate, 23, 30);
      expect(sunday.getDay()).toBe(0);
      const monday = new Date(2026, 2, sundayDate - 6, 0, 30);
      expect(monday.getDay()).toBe(1);
      expect(bucket("week", sunday).key).toBe(bucket("week", monday).key);
      // …and the day before that Monday is the PREVIOUS week.
      expect(
        bucket("week", new Date(2026, 2, sundayDate - 7, 23, 30)).key,
      ).not.toBe(bucket("week", monday).key);
    }
  });
});

describe("month", () => {
  it("keys on yyyy-mm and orders by the 1st", () => {
    expect(bucket("month", at(2026, 5, 13))).toEqual({
      key: "month:2026-05",
      label: "May 2026",
      order: new Date(2026, 4, 1).getTime(),
    });
  });

  it("separates the same month in different years", () => {
    expect(bucket("month", at(2025, 5, 13)).key).toBe("month:2025-05");
    expect(bucket("month", at(2025, 5, 13)).label).toBe("May 2025");
  });
});

describe("year", () => {
  it("keys on the year and orders by Jan 1", () => {
    expect(bucket("year", at(2026, 5, 13))).toEqual({
      key: "year:2026",
      label: "2026",
      order: new Date(2026, 0, 1).getTime(),
    });
  });

  it("breaks on the local New Year, not the UTC one", () => {
    expect(bucket("year", new Date(2026, 11, 31, 23, 59)).key).toBe(
      "year:2026",
    );
    expect(bucket("year", new Date(2027, 0, 1, 0, 0)).key).toBe("year:2027");
  });
});

describe("every grouping", () => {
  const NOT_A_DATE: FieldValue[] = [
    null,
    undefined,
    "not a date",
    new Date(Number.NaN),
  ];

  it("answers null for a value it cannot bucket, rather than minting a bucket", () => {
    // `null` is the ONLY spelling of "not a value I can bucket" — data-view files
    // the row in the same "None" section as a genuinely null value. A catch-all
    // bucket of our own would be a second section wearing that name, and its
    // ordinal would have to be non-finite, which `partitionIntoSections` rejects.
    for (const g of GROUPINGS) {
      for (const value of NOT_A_DATE) {
        expect(g.plan(ctx())(value)).toBeNull();
      }
    }
  });

  it("gives every real date a finite ordinal", () => {
    // The invariant behind that rejection: nothing this type buckets can carry a
    // non-finite `order`, in either sort direction.
    for (const g of GROUPINGS) {
      const plan = g.plan(ctx());
      for (let offset = -400; offset <= 400; offset += 7) {
        const seen = plan(new Date(2026, 4, 13 + offset, 12, 0));
        expect(seen).not.toBeNull();
        expect(Number.isFinite(seen!.order)).toBe(true);
      }
    }
  });

  it("accepts a Date, an epoch millisecond number, and an ISO string alike", () => {
    const date = at(2026, 5, 20);
    for (const g of GROUPINGS) {
      const plan = g.plan(ctx());
      expect(plan(date)).not.toBeNull();
      expect(plan(date.getTime())).toEqual(plan(date));
      expect(plan(date.toISOString())).toEqual(plan(date));
    }
  });

  it("reads the clock only from ctx.now", () => {
    // Same value, a clock one year on: only the relative grouping moves.
    const nextYear = new Date(2027, 4, 13, 12, 0).getTime();
    const value = at(2026, 5, 13);
    expect(bucket("smart", value).key).toBe("today");
    expect(bucket("smart", value, nextYear).key).toBe("older");
    expect(bucket("month", value, nextYear)).toEqual(bucket("month", value));
    expect(bucket("year", value, nextYear)).toEqual(bucket("year", value));
  });
});
