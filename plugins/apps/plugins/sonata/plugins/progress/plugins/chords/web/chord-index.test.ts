import { describe, expect, test } from "bun:test";
import { chordIndexAt } from "./chord-index";

const spans = [
  { start: 0, end: 4 },
  { start: 4, end: 6 },
  // gap [6, 8)
  { start: 8, end: 12 },
];

describe("chordIndexAt", () => {
  test("finds the span holding the beat, start inclusive, end exclusive", () => {
    expect(chordIndexAt(spans, 0)).toBe(0);
    expect(chordIndexAt(spans, 3.99)).toBe(0);
    expect(chordIndexAt(spans, 4)).toBe(1);
    expect(chordIndexAt(spans, 8)).toBe(2);
    expect(chordIndexAt(spans, 11.5)).toBe(2);
  });

  test("is -1 in a gap, before the first span and past the last", () => {
    expect(chordIndexAt(spans, 6)).toBe(-1);
    expect(chordIndexAt(spans, 7.9)).toBe(-1);
    expect(chordIndexAt(spans, -1)).toBe(-1);
    expect(chordIndexAt(spans, 12)).toBe(-1);
  });

  test("is -1 for no spans", () => {
    expect(chordIndexAt([], 0)).toBe(-1);
  });
});
