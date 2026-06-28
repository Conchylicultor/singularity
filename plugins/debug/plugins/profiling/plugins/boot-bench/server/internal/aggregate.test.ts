import { describe, it, expect } from "bun:test";
import { min, median, p95, stat, aggregateMode } from "./aggregate";
import type { IterResult } from "../../shared/endpoints";

describe("min", () => {
  it("returns the smallest value, order-independent", () => {
    expect(min([3, 1, 2])).toBe(1);
    expect(min([5])).toBe(5);
    expect(min([-2, 0, 4])).toBe(-2);
  });
  it("throws on empty", () => {
    expect(() => min([])).toThrow();
  });
});

describe("median", () => {
  it("odd count picks the middle", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
  });
  it("even count averages the two middles", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("single element", () => {
    expect(median([7])).toBe(7);
  });
});

describe("p95", () => {
  it("interpolates near the top", () => {
    expect(p95([0, 10])).toBeCloseTo(9.5, 10);
  });
  it("single element", () => {
    expect(p95([5])).toBe(5);
  });
  it("0..100 in steps of 10", () => {
    // 11 points, rank = 0.95 * 10 = 9.5 → between 90 and 100.
    expect(p95([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBeCloseTo(95, 10);
  });
});

describe("stat", () => {
  it("bundles min/median/p95", () => {
    expect(stat([1, 2, 3])).toEqual({ min: 1, median: 2, p95: 2.9 });
  });
});

describe("aggregateMode", () => {
  const iter = (
    total: number,
    workMs: number,
    source: "persisted" | "loader",
    loaderMs: number,
    maxMs: number,
  ): IterResult => ({
    bootSnapshot: { totalMs: total, perKey: { "edited-files": { source, workMs } } },
    firstSubscribe: {
      "edited-files": { onFirstSubscribeMs: 1, loaderMs },
      "commits-graph.delta": null,
    },
    eventLoop: { maxMs, p99Ms: 0, meanMs: 0 },
    runtimeProfile: { topLoaders: [] },
  });

  it("aggregates totals, per-key, first-subscribe, and event loop", () => {
    const agg = aggregateMode([
      iter(10, 2, "loader", 5, 100),
      iter(20, 4, "loader", 7, 200),
      iter(30, 6, "loader", 9, 300),
    ]);
    expect(agg.iterations).toBe(3);
    expect(agg.bootSnapshotTotalMs.median).toBe(20);
    expect(agg.bootSnapshotPerKey["edited-files"]!.source).toBe("loader");
    expect(agg.bootSnapshotPerKey["edited-files"]!.workMs.min).toBe(2);
    expect(agg.firstSubscribe["edited-files"]!.loaderMs.median).toBe(7);
    // A target null in every iteration aggregates to null, not a crash.
    expect(agg.firstSubscribe["commits-graph.delta"]).toBeNull();
    expect(agg.eventLoopMaxMs.p95).toBeCloseTo(290, 10);
  });

  it("marks a per-key source mixed when it varies across iterations", () => {
    const agg = aggregateMode([
      iter(10, 2, "loader", 5, 100),
      iter(10, 2, "persisted", 5, 100),
    ]);
    expect(agg.bootSnapshotPerKey["edited-files"]!.source).toBe("mixed");
  });

  it("throws on an empty iteration set", () => {
    expect(() => aggregateMode([])).toThrow();
  });
});
