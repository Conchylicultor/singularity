import { describe, expect, test } from "bun:test";
import {
  DECOMP_ERROR_PER_SEC,
  DECOMP_MILD_PER_SEC,
  DECOMP_STRONG_PER_SEC,
  hostPressureScore,
  pressureBucket,
} from "./pressure";

const CPUS = 8;

describe("hostPressureScore", () => {
  test("calm on both channels scores below the mild line", () => {
    expect(hostPressureScore({ loadAvg1: 2, decompPerSec: 1_000 }, CPUS)).toBeLessThan(1);
  });

  test("load-only pressure matches the existing load ramp lines", () => {
    expect(hostPressureScore({ loadAvg1: 0.75 * CPUS }, CPUS)).toBe(1);
    expect(hostPressureScore({ loadAvg1: 1.5 * CPUS }, CPUS)).toBe(2);
    expect(hostPressureScore({ loadAvg1: 2.5 * CPUS }, CPUS)).toBe(3);
  });

  test("decompression thresholds hit the mild/strong/error lines", () => {
    expect(hostPressureScore({ decompPerSec: DECOMP_MILD_PER_SEC }, CPUS)).toBe(1);
    expect(hostPressureScore({ decompPerSec: DECOMP_STRONG_PER_SEC }, CPUS)).toBe(2);
    expect(hostPressureScore({ decompPerSec: DECOMP_ERROR_PER_SEC }, CPUS)).toBe(3);
  });

  test("a compressor spike under calm load dominates the score (the freeze signature)", () => {
    // The 2026-07-11 freezes: swap ≈ 0, decompressions 240k–442k/s.
    const score = hostPressureScore({ loadAvg1: 3, decompPerSec: 340_000 }, CPUS);
    expect(score).toBeGreaterThan(3);
    expect(pressureBucket(score)).toBe("error");
  });

  test("monotone within a bucket, so bucket-max keeps the true peak", () => {
    const lo = hostPressureScore({ decompPerSec: 260_000 }, CPUS);
    const hi = hostPressureScore({ decompPerSec: 440_000 }, CPUS);
    expect(hi).toBeGreaterThan(lo);
  });

  test("missing fields score on the other channel alone", () => {
    expect(hostPressureScore({ loadAvg1: 2.5 * CPUS }, CPUS)).toBe(3);
    expect(hostPressureScore({}, CPUS)).toBe(0);
  });

  test("zero cpuCount never divides by zero", () => {
    expect(hostPressureScore({ loadAvg1: 24 }, 0)).toBe(0);
  });
});

describe("pressureBucket", () => {
  test("buckets at the 1/2/3 lines", () => {
    expect(pressureBucket(0.99)).toBe("calm");
    expect(pressureBucket(1)).toBe("mild");
    expect(pressureBucket(2)).toBe("strong");
    expect(pressureBucket(3)).toBe("error");
  });
});
