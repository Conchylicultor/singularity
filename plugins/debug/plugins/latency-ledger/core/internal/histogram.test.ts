import { describe, expect, test } from "bun:test";
import {
  BUCKET_COUNT,
  addSample,
  bucketIndexFor,
  bucketLowerMs,
  countAtOrAbove,
  emptyAcc,
  emptyCounts,
  mergeAcc,
  mergeCounts,
  percentileFromCounts,
} from "./histogram";

// Reference percentile over the raw samples (nearest-rank), to hold the
// histogram's answer against.
function rawPercentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0
  );
}

describe("latency histogram", () => {
  test("a sample lands in the bucket whose edges contain it", () => {
    for (const ms of [0, 0.4, 1, 1.19, 1.2, 7, 199, 200, 999, 1000, 59_999]) {
      const i = bucketIndexFor(ms);
      expect(ms).toBeGreaterThanOrEqual(bucketLowerMs(i));
      if (i < BUCKET_COUNT - 1) expect(ms).toBeLessThan(bucketLowerMs(i + 1));
    }
  });

  test("everything above the last edge, and nothing else, goes to overflow", () => {
    expect(bucketIndexFor(10 * 60_000)).toBe(BUCKET_COUNT - 1);
    expect(bucketIndexFor(100_000)).toBeLessThan(BUCKET_COUNT - 1);
    expect(bucketIndexFor(Number.NaN)).toBe(0);
    expect(bucketIndexFor(-5)).toBe(0);
  });

  test("p50 and p95 stay within one bucket (20%) of the raw-sample answer", () => {
    // A long-tailed distribution like a real page load: mostly fast, a few slow.
    const samples: number[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 5_000; i++) {
      samples.push(20 * Math.exp(rand() * rand() * 7));
    }
    const acc = emptyAcc();
    for (const s of samples) addSample(acc, s);
    for (const p of [0.5, 0.95, 0.99]) {
      const got = percentileFromCounts(acc.counts, p, acc.maxMs);
      const want = rawPercentile(samples, p);
      expect(got).not.toBeNull();
      expect(Math.abs((got ?? 0) - want) / want).toBeLessThan(0.2);
    }
  });

  test("no samples means no percentile, not zero", () => {
    expect(percentileFromCounts(emptyCounts(), 0.95, 0)).toBeNull();
  });

  test("a percentile in the overflow bucket answers the max, and never exceeds it", () => {
    const acc = emptyAcc();
    addSample(acc, 400_000);
    expect(percentileFromCounts(acc.counts, 0.95, acc.maxMs)).toBe(400_000);
    const one = emptyAcc();
    addSample(one, 1_001);
    expect(
      percentileFromCounts(one.counts, 0.95, one.maxMs),
    ).toBeLessThanOrEqual(1_001);
  });

  test("merging two histograms equals one histogram of all the samples", () => {
    const a = emptyAcc();
    const b = emptyAcc();
    const all = emptyAcc();
    for (const s of [3, 30, 300]) {
      addSample(a, s);
      addSample(all, s);
    }
    for (const s of [5, 50, 5_000]) {
      addSample(b, s, { censored: s === 5_000 });
      addSample(all, s, { censored: s === 5_000 });
    }
    expect(mergeAcc(a, b)).toEqual(all);
  });

  test("merging misaligned arrays throws instead of adding them", () => {
    expect(() => mergeCounts([1, 2, 3], emptyCounts())).toThrow();
  });

  test("an excluded sample is counted as excluded and kept out of the distribution", () => {
    const acc = emptyAcc();
    addSample(acc, 1_569_000, { excluded: true });
    addSample(acc, 120);
    expect(acc.count).toBe(1);
    expect(acc.excluded).toBe(1);
    expect(acc.maxMs).toBe(120);
  });

  test("counts samples at or above a bar, to the bucket", () => {
    const acc = emptyAcc();
    for (const s of [10, 150, 250, 900]) addSample(acc, s);
    expect(countAtOrAbove(acc.counts, 200)).toBe(2);
  });
});
