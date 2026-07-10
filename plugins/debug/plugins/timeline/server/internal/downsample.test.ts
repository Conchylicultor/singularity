import { describe, expect, test } from "bun:test";
import { downsampleBucketMax } from "./downsample";

interface Pt {
  at: number;
  v: number;
}
const opts = (fromMs: number, toMs: number, maxPoints: number) => ({
  fromMs,
  toMs,
  maxPoints,
  atMsOf: (p: Pt) => p.at,
  valueOf: (p: Pt) => p.v,
});

describe("downsampleBucketMax", () => {
  test("returns series unchanged when already within the cap", () => {
    const pts: Pt[] = [
      { at: 10, v: 1 },
      { at: 20, v: 2 },
    ];
    expect(downsampleBucketMax(pts, opts(0, 100, 5))).toEqual(pts);
  });

  test("caps the output at maxPoints", () => {
    const pts: Pt[] = Array.from({ length: 2000 }, (_, i) => ({ at: i, v: i % 7 }));
    const out = downsampleBucketMax(pts, opts(0, 2000, 500));
    expect(out.length).toBeLessThanOrEqual(500);
  });

  test("keeps the per-bucket maximum, so a spike survives", () => {
    // 100 points, one spike at at=55; downsample to 10 buckets.
    const pts: Pt[] = Array.from({ length: 100 }, (_, i) => ({
      at: i,
      v: i === 55 ? 999 : 1,
    }));
    const out = downsampleBucketMax(pts, opts(0, 100, 10));
    expect(out.length).toBe(10);
    expect(out.some((p) => p.v === 999)).toBe(true);
  });

  test("output stays in chronological order", () => {
    const pts: Pt[] = Array.from({ length: 100 }, (_, i) => ({ at: i, v: (i * 13) % 11 }));
    const out = downsampleBucketMax(pts, opts(0, 100, 10));
    const ats = out.map((p) => p.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  test("a point exactly at toMs lands in the last bucket, not out of range", () => {
    const pts: Pt[] = Array.from({ length: 20 }, (_, i) => ({ at: i * 5, v: 1 })).concat([
      { at: 100, v: 50 },
    ]);
    const out = downsampleBucketMax(pts, opts(0, 100, 4));
    expect(out.length).toBe(4);
    expect(out.at(-1)).toEqual({ at: 100, v: 50 });
  });
});
