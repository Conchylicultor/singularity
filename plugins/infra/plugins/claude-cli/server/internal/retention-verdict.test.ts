import { describe, expect, test } from "bun:test";
import { statusForNoCalls } from "./retention-verdict";

const LIMIT = 1000;
const OLDEST = new Date("2026-08-06T12:00:00.000Z");
const BEFORE = new Date("2026-08-06T11:59:59.000Z");
const AFTER = new Date("2026-08-06T12:00:01.000Z");

describe("statusForNoCalls", () => {
  test("no occurredAt is always `none` — the horizon is untestable", () => {
    expect(
      statusForNoCalls({ occurredAt: undefined, total: LIMIT, oldest: OLDEST, limit: LIMIT }),
    ).toBe("none");
  });

  test("below capacity is `none` even for a record older than every call", () => {
    // The fresh-install case the capacity check exists for: nothing has ever
    // been trimmed, so an old record simply never made a call.
    expect(
      statusForNoCalls({ occurredAt: BEFORE, total: LIMIT - 1, oldest: OLDEST, limit: LIMIT }),
    ).toBe("none");
  });

  test("at capacity and older than the oldest survivor is `not-retained`", () => {
    expect(
      statusForNoCalls({ occurredAt: BEFORE, total: LIMIT, oldest: OLDEST, limit: LIMIT }),
    ).toBe("not-retained");
  });

  test("over capacity counts as at capacity", () => {
    expect(
      statusForNoCalls({ occurredAt: BEFORE, total: LIMIT + 7, oldest: OLDEST, limit: LIMIT }),
    ).toBe("not-retained");
  });

  test("at capacity but newer than the oldest survivor is `none`", () => {
    // The record is inside the retained window, so its calls would still be
    // here — it genuinely made none.
    expect(
      statusForNoCalls({ occurredAt: AFTER, total: LIMIT, oldest: OLDEST, limit: LIMIT }),
    ).toBe("none");
  });

  test("exactly at the horizon is `none` — the boundary is not strictly older", () => {
    expect(
      statusForNoCalls({ occurredAt: OLDEST, total: LIMIT, oldest: OLDEST, limit: LIMIT }),
    ).toBe("none");
  });

  test("an empty log has no horizon to compare against", () => {
    expect(
      statusForNoCalls({ occurredAt: BEFORE, total: 0, oldest: null, limit: LIMIT }),
    ).toBe("none");
  });
});
