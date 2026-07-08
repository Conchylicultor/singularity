import { describe, expect, it } from "bun:test";
import { currentLine, nextLine, prevLine } from "./helpers";

/**
 * The rewind-reaches-the-lead-in behavior. The seek grid runs `[0, end]`; the
 * timeline origin (the empty lead-in pre-roll bar) sits one unit BELOW it and is
 * supplied to the backward lookups as the `min` clamp. Before this, `prevLine` /
 * `currentLine` hard-floored at 0, so a rewind off beat 0 stuck on the first
 * note instead of stepping back onto the empty bar the user expects.
 */
describe("backward line-lookups honor the `min` clamp (lead-in origin)", () => {
  // A 4/4 seek grid over three bars, with the lead-in origin one bar below 0.
  const grid = [{ startBeat: 0 }, { startBeat: 4 }, { startBeat: 8 }];
  const end = 12;
  const origin = -4; // scoreStartBeat: one 4/4 bar of pre-roll

  it("rewinds OFF beat 0 down to the lead-in origin, not a hard 0 floor", () => {
    // The bug: prevLine(grid, 0) === 0 (stuck on the first note).
    expect(prevLine(grid, 0)).toBe(0);
    // The fix: with the origin as `min`, the step lands on the empty pre-roll bar.
    expect(prevLine(grid, 0, origin)).toBe(origin);
  });

  it("bottoms out AT the origin — a further rewind stays put", () => {
    expect(prevLine(grid, origin, origin)).toBe(origin);
    expect(currentLine(grid, origin, origin)).toBe(origin);
  });

  it("treats the origin as before the first real unit", () => {
    // Sitting in the lead-in, the current unit is the origin itself…
    expect(currentLine(grid, -2, origin)).toBe(origin);
    // …and a forward step off it lands on the first note at beat 0.
    expect(nextLine(grid, origin, end)).toBe(0);
  });

  it("leaves in-song stepping unchanged (min never bites above 0)", () => {
    expect(prevLine(grid, 6, origin)).toBe(4);
    expect(currentLine(grid, 6, origin)).toBe(4);
    expect(nextLine(grid, 6, end)).toBe(8);
    expect(nextLine(grid, 10, end)).toBe(end);
  });

  it("defaults `min` to 0 — callers that don't opt in are unaffected", () => {
    expect(prevLine(grid, 4)).toBe(0);
    expect(currentLine(grid, -1)).toBe(0);
  });
});
