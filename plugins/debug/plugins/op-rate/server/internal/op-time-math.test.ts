import { expect, test, describe } from "bun:test";
import { windowDelta, computeRollup } from "./op-time-math";

describe("windowDelta", () => {
  test("first observation seeds (returns null, fires nothing)", () => {
    expect(windowDelta(undefined, 5000)).toBeNull();
  });

  test("monotonic growth returns the difference", () => {
    expect(windowDelta(1000, 3500)).toBe(2500);
  });

  test("no change returns zero", () => {
    expect(windowDelta(4200, 4200)).toBe(0);
  });

  test("reset/regression takes the full current value as the delta", () => {
    // Profile was reset (or the label is new this tick) so `current < prev`.
    expect(windowDelta(9000, 1200)).toBe(1200);
  });

  test("zero current after a reset is zero, not negative", () => {
    expect(windowDelta(9000, 0)).toBe(0);
  });
});

describe("computeRollup", () => {
  test("under budget returns null", () => {
    const deltas = [
      { label: "a", deltaMs: 10000 },
      { label: "b", deltaMs: 20000 },
    ];
    // sum 30000 <= 60000*1
    expect(computeRollup(deltas, 60000, 1)).toBeNull();
  });

  test("exactly at budget does not trip (strict >)", () => {
    const deltas = [{ label: "a", deltaMs: 40000 }];
    expect(computeRollup(deltas, 10000, 4)).toBeNull();
  });

  test("over budget trips and reports the sum and rollup budget", () => {
    const deltas = [
      { label: "a", deltaMs: 30000 },
      { label: "b", deltaMs: 25000 },
    ];
    const breach = computeRollup(deltas, 10000, 4);
    expect(breach).not.toBeNull();
    expect(breach!.sumDeltaMs).toBe(55000);
    expect(breach!.rollupBudgetMs).toBe(40000);
  });

  test("topLabels are sorted by delta desc and capped at 10", () => {
    const deltas = Array.from({ length: 15 }, (_, i) => ({
      label: `l${i}`,
      deltaMs: (i + 1) * 1000,
    }));
    const breach = computeRollup(deltas, 1000, 1);
    expect(breach).not.toBeNull();
    expect(breach!.topLabels).toHaveLength(10);
    expect(breach!.topLabels[0]).toEqual({ label: "l14", deltaMs: 15000 });
    expect(breach!.topLabels[9]).toEqual({ label: "l5", deltaMs: 6000 });
  });

  test("empty deltas never trip", () => {
    expect(computeRollup([], 0, 4)).toBeNull();
  });
});
