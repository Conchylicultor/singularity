import { describe, expect, test } from "bun:test";
import { computeNextRunAt } from "./schedule";

describe("computeNextRunAt", () => {
  const from = new Date("2026-08-03T10:00:00Z");

  test("a manual source is never scheduled", () => {
    // `null` means "no watermark", not "due now" — the tick must never pick it up.
    expect(computeNextRunAt("manual", from)).toBeNull();
  });

  test("hourly / daily / weekly offset from the end of the run", () => {
    expect(computeNextRunAt("hourly", from)?.toISOString()).toBe(
      "2026-08-03T11:00:00.000Z",
    );
    expect(computeNextRunAt("daily", from)?.toISOString()).toBe(
      "2026-08-04T10:00:00.000Z",
    );
    expect(computeNextRunAt("weekly", from)?.toISOString()).toBe(
      "2026-08-10T10:00:00.000Z",
    );
  });

  test("does not mutate the date it was handed", () => {
    computeNextRunAt("daily", from);
    expect(from.toISOString()).toBe("2026-08-03T10:00:00.000Z");
  });
});
