import { describe, expect, it } from "bun:test";
import { TILE_MAX, TILE_MIN, clampTile, gridMove, stepTile } from "./grid";

describe("clampTile / stepTile", () => {
  it("holds the tile size inside the slider's range", () => {
    expect(clampTile(10)).toBe(TILE_MIN);
    expect(clampTile(10_000)).toBe(TILE_MAX);
    expect(clampTile(200.4)).toBe(200.4);
  });

  it("steps proportionally and stops at the ends", () => {
    expect(stepTile(200, 1)).toBe(250);
    expect(stepTile(200, -1)).toBe(160);
    expect(stepTile(201, 1)).toBe(251.25);
    expect(stepTile(TILE_MAX, 1)).toBe(TILE_MAX);
    expect(stepTile(TILE_MIN, -1)).toBe(TILE_MIN);
  });
});

describe("gridMove", () => {
  // 10 items, 4 wide:
  //  0 1 2 3
  //  4 5 6 7
  //  8 9
  it("steps one item left / right, wrapping across rows", () => {
    expect(gridMove(3, "right", 4, 10)).toBe(4);
    expect(gridMove(4, "left", 4, 10)).toBe(3);
  });

  it("steps a whole row up / down", () => {
    expect(gridMove(1, "down", 4, 10)).toBe(5);
    expect(gridMove(5, "up", 4, 10)).toBe(1);
  });

  it("stays on the first / last item past either end", () => {
    expect(gridMove(0, "left", 4, 10)).toBe(0);
    expect(gridMove(1, "up", 4, 10)).toBe(0);
    expect(gridMove(9, "right", 4, 10)).toBe(9);
    expect(gridMove(6, "down", 4, 10)).toBe(9);
  });

  it("treats a degenerate column count as one column", () => {
    expect(gridMove(2, "down", 0, 10)).toBe(3);
  });
});
