import { describe, expect, test } from "bun:test";
import { adaptiveTimeoutMs } from "./adaptive-timeout";

describe("adaptiveTimeoutMs (pure math)", () => {
  const base = 20_000;
  const max = 120_000;

  test("no overload (load below core count) → base", () => {
    expect(adaptiveTimeoutMs(base, max, 2, 8)).toBe(base);
  });

  test("load exactly at core count → base", () => {
    expect(adaptiveTimeoutMs(base, max, 8, 8)).toBe(base);
  });

  test("moderate overload scales linearly", () => {
    // load1=16, numCPU=8 → factor = 1 + (16-8)/8 = 2 → 40_000
    expect(adaptiveTimeoutMs(base, max, 16, 8)).toBe(40_000);
  });

  test("heavy overload clamps to max", () => {
    // load1=400, numCPU=8 → factor ~50 → would be 1_000_000, clamped to max
    expect(adaptiveTimeoutMs(base, max, 400, 8)).toBe(max);
  });

  test("result never falls below base", () => {
    expect(adaptiveTimeoutMs(base, max, 0, 8)).toBe(base);
  });

  test("degenerate numCPU (0) → base, no NaN", () => {
    expect(adaptiveTimeoutMs(base, max, 40, 0)).toBe(base);
  });

  test("non-finite load → base", () => {
    expect(adaptiveTimeoutMs(base, max, Number.NaN, 8)).toBe(base);
  });

  test("restart window: base 30s cap 130s under heavy load clamps to cap", () => {
    expect(adaptiveTimeoutMs(30_000, 130_000, 400, 8)).toBe(130_000);
  });

  test("two-arg host form returns a value within [base, max]", () => {
    const v = adaptiveTimeoutMs(base, max);
    expect(v).toBeGreaterThanOrEqual(base);
    expect(v).toBeLessThanOrEqual(max);
  });
});
