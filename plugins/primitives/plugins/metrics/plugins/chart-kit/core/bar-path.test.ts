import { describe, expect, it } from "bun:test";
import { barPath, offsetBarPath } from "./bar-path";

describe("barPath", () => {
  it("rounds the top of an upward bar and keeps the baseline square", () => {
    // x=50, w=20 → left 40, right 60; baseline 100, top 40, r 4.
    expect(barPath(50, 20, 100, 40, 4)).toBe(
      "M40,100V44Q40,40 44,40H56Q60,40 60,44V100Z",
    );
  });

  it("rounds the bottom of a downward bar", () => {
    expect(barPath(50, 20, 100, 160, 4)).toBe(
      "M40,100V156Q40,160 44,160H56Q60,160 60,156V100Z",
    );
  });

  it("clamps the radius on a tiny bar", () => {
    // 2px tall: radius clamps to 2, never past the baseline.
    expect(barPath(50, 20, 100, 98, 4)).toBe(
      "M40,100V100Q40,98 42,98H58Q60,98 60,100V100Z",
    );
    // 2px wide: radius clamps to half the width.
    expect(barPath(50, 2, 100, 40, 4)).toBe(
      "M49,100V41Q49,40 50,40H50Q51,40 51,41V100Z",
    );
  });

  it("draws nothing under half a pixel or at zero width", () => {
    expect(barPath(50, 20, 100, 99.7, 4)).toBe("");
    expect(barPath(50, 0, 100, 40, 4)).toBe("");
  });
});

describe("offsetBarPath", () => {
  it("lifts the bar off its zero line by the gap", () => {
    expect(offsetBarPath(50, 20, 100, 40, 1, 4)).toBe(
      barPath(50, 20, 99, 40, 4),
    );
    expect(offsetBarPath(50, 20, 100, 160, 1, 4)).toBe(
      barPath(50, 20, 101, 160, 4),
    );
  });

  it("draws nothing for a value that cannot clear the gap", () => {
    expect(offsetBarPath(50, 20, 100, 99.5, 2, 4)).toBe("");
    expect(offsetBarPath(50, 20, 100, 100.5, 2, 4)).toBe("");
  });
});
