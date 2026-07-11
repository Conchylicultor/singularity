import { describe, expect, test } from "bun:test";
import { heatColorClass, heatSegments, type HeatSegment } from "./heat";
import type { TimelineWindow } from "./view-model";

const range: TimelineWindow = { fromMs: 0, toMs: 100_000 };

function heatOnly(segments: HeatSegment[]) {
  return segments.filter((s) => s.kind === "heat");
}
function darkOnly(segments: HeatSegment[]) {
  return segments.filter((s) => s.kind === "dark");
}

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

  test("host buckets on the compressor channel even under calm load (the freeze signature)", () => {
    expect(heatColorClass({ atMs: 0, loadAvg1: 2, decompPerSec: 1_000 }, "host", 8)).toBeNull();
    expect(heatColorClass({ atMs: 0, loadAvg1: 2, decompPerSec: 20_000 }, "host", 8)).toBe(
      "bg-warning/40",
    );
    expect(heatColorClass({ atMs: 0, loadAvg1: 2, decompPerSec: 100_000 }, "host", 8)).toBe(
      "bg-warning/80",
    );
    // 2026-07-11 freezes: 240k–442k decompressions/s with swap ≈ 0.
    expect(heatColorClass({ atMs: 0, loadAvg1: 2, decompPerSec: 340_000 }, "host", 8)).toBe(
      "bg-destructive/70",
    );
  });

  test("zero cpuCount never divides by zero", () => {
    expect(heatColorClass({ atMs: 0, loadAvg1: 24 }, "host", 0)).toBeNull();
  });

  test("a wall-jump (sleep) point contributes no severity, however wild its metrics", () => {
    expect(
      heatColorClass({ atMs: 0, p99Ms: 2, maxMs: 900_000, wallJumpMs: 900_000 }, "backend", 8),
    ).toBeNull();
    expect(
      heatColorClass({ atMs: 0, loadAvg1: 40, wallJumpMs: 900_000 }, "host", 8),
    ).toBeNull();
  });
});

describe("heatSegments", () => {
  test("calm points render no heat", () => {
    // (The stretch after the series' end still renders dark — asserted in the
    // trailing-gap test below.)
    expect(
      heatOnly(
        heatSegments(
          [
            { atMs: 10_000, p99Ms: 10 },
            { atMs: 20_000, p99Ms: 20 },
          ],
          range,
          "backend",
          8,
        ),
      ),
    ).toEqual([]);
  });

  test("each elevated point owns the span to its neighbor midpoints", () => {
    const segments = heatOnly(
      heatSegments(
        [
          { atMs: 10_000, p99Ms: 10 },
          { atMs: 20_000, p99Ms: 200 },
          { atMs: 30_000, p99Ms: 10 },
        ],
        range,
        "backend",
        8,
      ),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "heat",
      startMs: 15_000,
      endMs: 25_000,
      colorClass: "bg-warning/40",
    });
  });

  test("adjacent same-color segments merge into one", () => {
    const segments = heatOnly(
      heatSegments(
        [
          { atMs: 10_000, p99Ms: 200 },
          { atMs: 20_000, p99Ms: 300 },
        ],
        range,
        "backend",
        8,
      ),
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "heat",
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
    expect(heatOnly(segments).map((s) => s.colorClass)).toEqual([
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
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "heat",
      startMs: 35_000,
      endMs: 65_000,
      colorClass: "bg-warning/40",
    });
  });

  test("unsorted input is sorted before segmentation", () => {
    const segments = heatOnly(
      heatSegments(
        [
          { atMs: 20_000, p99Ms: 200 },
          { atMs: 10_000, p99Ms: 200 },
        ],
        range,
        "backend",
        8,
      ),
    );
    expect(segments).toHaveLength(1);
  });

  test("an elevated point beside a void is capped, never stretched across it", () => {
    // 10s cadence, then a 60_000ms void: the midpoint rule would paint the
    // elevated point 30_000ms into unsampled time.
    const wide: TimelineWindow = { fromMs: 0, toMs: 200_000 };
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 30 },
        { atMs: 30_000, p99Ms: 40 },
        { atMs: 40_000, p99Ms: 600 },
        { atMs: 130_000, p99Ms: 10 },
      ],
      wide,
      "backend",
      8,
    );
    const heat = heatOnly(segments);
    expect(heat).toHaveLength(1);
    // median gap 10_000 → half-span cap 30_000.
    expect(heat[0]).toMatchObject({ startMs: 35_000, endMs: 70_000 });
  });

  test("a large gap renders its uncovered stretch dark (sampler dark)", () => {
    const wide: TimelineWindow = { fromMs: 0, toMs: 200_000 };
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 10 },
        { atMs: 30_000, p99Ms: 10 },
        { atMs: 130_000, p99Ms: 10 },
        { atMs: 140_000, p99Ms: 10 },
      ],
      wide,
      "backend",
      8,
    );
    const dark = darkOnly(segments);
    expect(dark).toHaveLength(1);
    // Gap 30_000→130_000 (10× median); uncovered = [30_000+cap, 130_000−cap].
    expect(dark[0]).toMatchObject({
      kind: "dark",
      reason: "no-data",
      startMs: 60_000,
      endMs: 100_000,
    });
  });

  test("a gap ending in a wall-jump point classifies as sleep", () => {
    const wide: TimelineWindow = { fromMs: 0, toMs: 200_000 };
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 10 },
        { atMs: 30_000, p99Ms: 10 },
        { atMs: 130_000, p99Ms: 10, wallJumpMs: 100_000 },
        { atMs: 140_000, p99Ms: 10 },
      ],
      wide,
      "backend",
      8,
    );
    const dark = darkOnly(segments);
    expect(dark).toHaveLength(1);
    expect(dark[0]!.reason).toBe("sleep");
    expect(dark[0]!.title).toContain("sleep");
  });

  test("a trailing gap to the window edge renders dark (a sampler dead NOW)", () => {
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 15_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 10 },
      ],
      range,
      "backend",
      8,
    );
    const dark = darkOnly(segments);
    expect(dark).toHaveLength(1);
    // median gap 5_000 → dark past 6× = 30_000; uncovered from the last
    // point's own half-span (2_500) to the window edge.
    expect(dark[0]).toMatchObject({ reason: "no-data", startMs: 22_500, endMs: 100_000 });
  });

  test("modest cadence jitter renders neither heat nor dark", () => {
    const segments = heatSegments(
      [
        { atMs: 10_000, p99Ms: 10 },
        { atMs: 20_000, p99Ms: 10 },
        { atMs: 45_000, p99Ms: 10 }, // 2.5× median — below the dark factor
        { atMs: 55_000, p99Ms: 10 },
      ],
      { fromMs: 0, toMs: 60_000 },
      "backend",
      8,
    );
    expect(segments).toEqual([]);
  });
});
