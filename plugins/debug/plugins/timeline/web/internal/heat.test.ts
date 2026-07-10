import { describe, expect, test } from "bun:test";
import { heatColorClass, heatSegments } from "./heat";
import type { TimelineWindow } from "./view-model";

const range: TimelineWindow = { fromMs: 0, toMs: 100_000 };

describe("heatColorClass", () => {
  test("backend buckets on event-loop p99", () => {
    expect(heatColorClass({ atMs: 0, p99Ms: 50 }, "backend", 8)).toBeNull();
    expect(heatColorClass({ atMs: 0, p99Ms: 100 }, "backend", 8)).toBe("bg-warning/40");
    expect(heatColorClass({ atMs: 0, p99Ms: 500 }, "backend", 8)).toBe("bg-warning/80");
    expect(heatColorClass({ atMs: 0, p99Ms: 1000 }, "backend", 8)).toBe("bg-destructive/70");
  });

  test("missing p99 counts as calm", () => {
    expect(heatColorClass({ atMs: 0 }, "backend", 8)).toBeNull();
  });

  test("host buckets on loadAvg1 / cpuCount ratio", () => {
    expect(heatColorClass({ atMs: 0, loadAvg1: 4 }, "host", 8)).toBeNull(); // 0.5
    expect(heatColorClass({ atMs: 0, loadAvg1: 8 }, "host", 8)).toBe("bg-warning/40"); // 1.0
    expect(heatColorClass({ atMs: 0, loadAvg1: 16 }, "host", 8)).toBe("bg-warning/80"); // 2.0
    expect(heatColorClass({ atMs: 0, loadAvg1: 24 }, "host", 8)).toBe("bg-destructive/70"); // 3.0
  });

  test("zero cpuCount never divides by zero", () => {
    expect(heatColorClass({ atMs: 0, loadAvg1: 24 }, "host", 0)).toBeNull();
  });
});

describe("heatSegments", () => {
  test("calm points render nothing", () => {
    expect(
      heatSegments(
        [
          { atMs: 10_000, p99Ms: 10 },
          { atMs: 20_000, p99Ms: 20 },
        ],
        range,
        "backend",
        8,
      ),
    ).toEqual([]);
  });

  test("each elevated point owns the span to its neighbor midpoints", () => {
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 200 },
        { atMs: 30_000, p99Ms: 10 },
      ],
      range,
      "backend",
      8,
    );
    expect(segments).toEqual([
      { startMs: 15_000, endMs: 25_000, colorClass: "bg-warning/40" },
    ]);
  });

  test("adjacent same-color segments merge into one", () => {
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 200 },
        { atMs: 20_000, p99Ms: 300 },
      ],
      range,
      "backend",
      8,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      startMs: 5_000,
      endMs: 25_000,
      colorClass: "bg-warning/40",
    });
  });

  test("different buckets stay separate segments", () => {
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 200 },
        { atMs: 20_000, p99Ms: 2_000 },
      ],
      range,
      "backend",
      8,
    );
    expect(segments.map((s) => s.colorClass)).toEqual([
      "bg-warning/40",
      "bg-destructive/70",
    ]);
  });

  test("segments clamp to the window", () => {
    const segments = heatSegments(
      [
        { atMs: 5_000, p99Ms: 200 },
        { atMs: 95_000, p99Ms: 200 },
      ],
      { fromMs: 10_000, toMs: 90_000 },
      "backend",
      8,
    );
    expect(segments[0]!.startMs).toBe(0);
    expect(segments[segments.length - 1]!.endMs).toBe(80_000);
  });

  test("a lone point paints a bounded default width", () => {
    const segments = heatSegments([{ atMs: 50_000, p99Ms: 200 }], range, "backend", 8);
    expect(segments).toEqual([
      { startMs: 35_000, endMs: 65_000, colorClass: "bg-warning/40" },
    ]);
  });

  test("unsorted input is sorted before segmentation", () => {
    const segments = heatSegments(
      [
        { atMs: 20_000, p99Ms: 200 },
        { atMs: 10_000, p99Ms: 200 },
      ],
      range,
      "backend",
      8,
    );
    expect(segments).toHaveLength(1);
  });
});
