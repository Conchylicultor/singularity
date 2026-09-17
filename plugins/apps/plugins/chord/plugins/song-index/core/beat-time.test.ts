import { describe, expect, it } from "bun:test";
import {
  beatTimesAlignment,
  beatToSeconds,
  resolveVideoFraction,
} from "./beat-time";

describe("beatToSeconds", () => {
  it("reads a two-point (start/end) alignment linearly", () => {
    // Sheet Sage "user" alignment of qveoYyGGodn, shifted to Hookpad beats.
    const alignment = beatTimesAlignment([1, 45], [51.85, 80.21]);
    expect(beatToSeconds(alignment, 1)).toBeCloseTo(51.85, 9);
    expect(beatToSeconds(alignment, 45)).toBeCloseTo(80.21, 9);
    expect(beatToSeconds(alignment, 23)).toBeCloseTo((51.85 + 80.21) / 2, 9);
  });

  it("reads a per-beat alignment piecewise", () => {
    const alignment = beatTimesAlignment([1, 2, 3, 4], [10, 10.5, 11.5, 12]);
    expect(beatToSeconds(alignment, 2)).toBe(10.5);
    expect(beatToSeconds(alignment, 2.5)).toBe(11);
    expect(beatToSeconds(alignment, 3.5)).toBe(11.75);
  });

  it("extends the first and last segments outside the points", () => {
    const alignment = beatTimesAlignment([1, 2, 3], [10, 11, 13]);
    expect(beatToSeconds(alignment, 0.5)).toBe(9.5);
    // Per-beat points can stop half a beat before the section's end.
    expect(beatToSeconds(alignment, 3.5)).toBe(14);
  });

  it("reads a video-fraction alignment once the video's length is known", () => {
    const resolved = resolveVideoFraction(
      { kind: "video-fraction", start: 0.25, end: 0.5, endBeat: 33 },
      200,
    );
    expect(beatToSeconds(resolved, 1)).toBe(50);
    expect(beatToSeconds(resolved, 33)).toBe(100);
    expect(beatToSeconds(resolved, 17)).toBe(75);
  });

  it("refuses an alignment it cannot read", () => {
    expect(() => beatTimesAlignment([1], [10])).toThrow("at least two points");
    expect(() => beatTimesAlignment([1, 2], [10])).toThrow("one time per beat");
    expect(() => beatTimesAlignment([1, 3, 3], [1, 2, 3])).toThrow(
      "strictly increase",
    );
  });
});
