import { describe, expect, test } from "bun:test";

import { buildMonthGrid, toISODay } from "./day-math";
import { isDayInBounds, pickFocusDay, resolveDayNavigation } from "./grid-nav";

/** The day `key` moves to from `from`, as `yyyy-mm-dd`, or `null`. */
function move(
  from: string,
  key: string,
  opts: { shiftKey?: boolean; weekStartsOn?: number } = {},
): string | null {
  const [y, m, d] = from.split("-").map(Number);
  const focused = new Date(y!, m! - 1, d!);
  const next = resolveDayNavigation(
    { key, shiftKey: opts.shiftKey ?? false },
    focused,
    opts.weekStartsOn ?? 0,
  );
  return next === null ? null : toISODay(next);
}

describe("resolveDayNavigation — arrows", () => {
  test("left/right move a single day", () => {
    expect(move("2026-08-14", "ArrowLeft")).toBe("2026-08-13");
    expect(move("2026-08-14", "ArrowRight")).toBe("2026-08-15");
  });

  test("up/down move a whole week", () => {
    expect(move("2026-08-14", "ArrowUp")).toBe("2026-08-07");
    expect(move("2026-08-14", "ArrowDown")).toBe("2026-08-21");
  });

  test("arrows cross month boundaries in both directions", () => {
    expect(move("2026-08-01", "ArrowLeft")).toBe("2026-07-31");
    expect(move("2026-08-31", "ArrowRight")).toBe("2026-09-01");
    expect(move("2026-08-03", "ArrowUp")).toBe("2026-07-27");
    expect(move("2026-08-28", "ArrowDown")).toBe("2026-09-04");
  });

  test("arrows cross year boundaries", () => {
    expect(move("2026-01-01", "ArrowLeft")).toBe("2025-12-31");
    expect(move("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(move("2026-12-28", "ArrowDown")).toBe("2027-01-04");
  });

  test("stepping down through the spring-forward week stays on calendar days", () => {
    // US spring-forward 2026 is Sunday March 8 (a 23-hour day), so an epoch
    // `+ 7 * 86_400_000` would land on March 6, not March 7.
    expect(move("2026-02-28", "ArrowDown")).toBe("2026-03-07");
    expect(move("2026-03-07", "ArrowDown")).toBe("2026-03-14");
    // …and through fall-back (Sunday November 1, a 25-hour day).
    expect(move("2026-10-25", "ArrowDown")).toBe("2026-11-01");
    expect(move("2026-11-01", "ArrowDown")).toBe("2026-11-08");
  });

  test("the returned day is local midnight", () => {
    const next = resolveDayNavigation(
      { key: "ArrowDown", shiftKey: false },
      new Date(2026, 2, 7),
      0,
    );
    if (next === null) throw new Error("unreachable");
    expect(next.getHours()).toBe(0);
  });
});

describe("resolveDayNavigation — Home / End", () => {
  // Aug 14 2026 is a Friday.
  test("weeks starting Sunday", () => {
    expect(move("2026-08-14", "Home")).toBe("2026-08-09");
    expect(move("2026-08-14", "End")).toBe("2026-08-15");
  });

  test("weeks starting Monday", () => {
    expect(move("2026-08-14", "Home", { weekStartsOn: 1 })).toBe("2026-08-10");
    expect(move("2026-08-14", "End", { weekStartsOn: 1 })).toBe("2026-08-16");
  });

  test("weeks starting Saturday", () => {
    expect(move("2026-08-14", "Home", { weekStartsOn: 6 })).toBe("2026-08-08");
    expect(move("2026-08-14", "End", { weekStartsOn: 6 })).toBe("2026-08-14");
  });

  test("a day already on the week start is its own Home", () => {
    // Aug 9 2026 is a Sunday.
    expect(move("2026-08-09", "Home")).toBe("2026-08-09");
    expect(move("2026-08-10", "Home", { weekStartsOn: 1 })).toBe("2026-08-10");
  });

  test("the week's edges can sit in the adjacent month", () => {
    expect(move("2026-08-01", "Home")).toBe("2026-07-26");
    expect(move("2026-08-31", "End")).toBe("2026-09-05");
  });

  test("an out-of-range weekStartsOn wraps like everywhere else", () => {
    expect(move("2026-08-14", "Home", { weekStartsOn: 7 })).toBe(
      move("2026-08-14", "Home", { weekStartsOn: 0 }),
    );
  });
});

describe("resolveDayNavigation — paging", () => {
  test("PageUp / PageDown move one month", () => {
    expect(move("2026-08-14", "PageUp")).toBe("2026-07-14");
    expect(move("2026-08-14", "PageDown")).toBe("2026-09-14");
  });

  test("Shift+PageUp / Shift+PageDown move one year", () => {
    expect(move("2026-08-14", "PageUp", { shiftKey: true })).toBe("2025-08-14");
    expect(move("2026-08-14", "PageDown", { shiftKey: true })).toBe(
      "2027-08-14",
    );
  });

  test("paging clamps to the target month's length instead of overflowing", () => {
    expect(move("2026-01-31", "PageDown")).toBe("2026-02-28");
    expect(move("2028-01-31", "PageDown")).toBe("2028-02-29");
    expect(move("2026-03-31", "PageUp")).toBe("2026-02-28");
  });

  test("a leap day paged by a year clamps rather than rolling into March", () => {
    expect(move("2028-02-29", "PageDown", { shiftKey: true })).toBe(
      "2029-02-28",
    );
    expect(move("2028-02-29", "PageUp", { shiftKey: true })).toBe("2027-02-28");
  });

  test("paging crosses the year boundary", () => {
    expect(move("2026-12-15", "PageDown")).toBe("2027-01-15");
    expect(move("2026-01-15", "PageUp")).toBe("2025-12-15");
  });

  test("Shift on an arrow key changes nothing", () => {
    expect(move("2026-08-14", "ArrowRight", { shiftKey: true })).toBe(
      "2026-08-15",
    );
  });
});

describe("resolveDayNavigation — keys that are not ours", () => {
  test("returns null so the caller leaves the event alone", () => {
    for (const key of [
      "Enter",
      " ",
      "Tab",
      "Escape",
      "a",
      "1",
      "ArrowLeftRight",
      "arrowleft",
      "",
    ]) {
      expect(move("2026-08-14", key)).toBeNull();
    }
  });
});

describe("isDayInBounds", () => {
  const day = new Date(2026, 7, 14);

  test("an absent bound is unbounded on that side", () => {
    expect(isDayInBounds(day)).toBe(true);
    expect(isDayInBounds(day, new Date(2026, 7, 1))).toBe(true);
    expect(isDayInBounds(day, undefined, new Date(2026, 7, 31))).toBe(true);
  });

  test("both bounds are inclusive", () => {
    expect(isDayInBounds(day, day, day)).toBe(true);
  });

  test("rejects outside the range", () => {
    expect(isDayInBounds(day, new Date(2026, 7, 15))).toBe(false);
    expect(isDayInBounds(day, undefined, new Date(2026, 7, 13))).toBe(false);
  });

  test("compares by calendar day, not instant — a late-evening bound still includes its own day", () => {
    expect(isDayInBounds(day, new Date(2026, 7, 14, 23, 59))).toBe(true);
    expect(isDayInBounds(new Date(2026, 7, 14, 0, 1), undefined, day)).toBe(
      true,
    );
  });
});

describe("pickFocusDay", () => {
  const viewMonth = new Date(2026, 7, 1); // August 2026
  const weeks = buildMonthGrid(viewMonth, 0);
  const today = new Date(2026, 7, 20);

  test("prefers the selected day", () => {
    expect(
      toISODay(
        pickFocusDay({ weeks, viewMonth, value: new Date(2026, 7, 5), today }),
      ),
    ).toBe("2026-08-05");
  });

  test("falls back to today when nothing is selected", () => {
    expect(
      toISODay(pickFocusDay({ weeks, viewMonth, value: null, today })),
    ).toBe("2026-08-20");
  });

  test("ignores a selection outside the view month", () => {
    expect(
      toISODay(
        pickFocusDay({ weeks, viewMonth, value: new Date(2026, 10, 5), today }),
      ),
    ).toBe("2026-08-20");
  });

  test("falls back to the 1st when today is another month", () => {
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: null,
          today: new Date(2026, 0, 9),
        }),
      ),
    ).toBe("2026-08-01");
  });

  test("normalizes a selection's time-of-day to local midnight", () => {
    const picked = pickFocusDay({
      weeks,
      viewMonth,
      value: new Date(2026, 7, 5, 23, 30),
      today,
    });
    expect(picked.getHours()).toBe(0);
  });

  test("skips a preferred day that `min` disables", () => {
    // The selection AND today are both before `min`, so neither is reachable;
    // the 1st is too, so the first in-bounds grid day wins.
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: new Date(2026, 7, 5),
          today,
          min: new Date(2026, 7, 25),
        }),
      ),
    ).toBe("2026-08-25");
  });

  test("skips the disabled 1st — the case that would drop the calendar out of the tab order", () => {
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: null,
          today: new Date(2026, 0, 9),
          min: new Date(2026, 7, 12),
        }),
      ),
    ).toBe("2026-08-12");
  });

  test("skips a preferred day that `max` disables and keeps walking the order", () => {
    // Both the selection (Aug 20) and today (Aug 20) are past `max`, so the
    // next preference — the 1st, which is in bounds — wins.
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: new Date(2026, 7, 20),
          today,
          max: new Date(2026, 7, 3),
        }),
      ),
    ).toBe("2026-08-01");
  });

  test("the fallback may be an adjacent-month cell — still a real, reachable button", () => {
    // Weeks start Sunday, so row 0 is Jul 26 … Aug 1. With `max` at Jul 28 the
    // only in-bounds cells in the grid are leading July days.
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: null,
          today,
          max: new Date(2026, 6, 28),
        }),
      ),
    ).toBe("2026-07-26");
  });

  test("a wholly out-of-bounds month still returns a day", () => {
    // Nothing is selectable, so there is no reachable target at all; the 1st
    // keeps the function total and the roving attribute lands on a disabled
    // button — the accurate rendering of "nothing here can be picked".
    expect(
      toISODay(
        pickFocusDay({
          weeks,
          viewMonth,
          value: null,
          today,
          min: new Date(2030, 0, 1),
        }),
      ),
    ).toBe("2026-08-01");
  });
});
