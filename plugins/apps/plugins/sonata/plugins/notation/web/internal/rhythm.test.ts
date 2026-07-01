import { describe, expect, test } from "bun:test";
import { planWindows, type RhythmWindow } from "./rhythm";

/** The single window a one-beat-bar plan produces (asserts exactly one). */
function onlyWindow(onsets: number[]): RhythmWindow {
  const plan = planWindows(onsets, 0, 1);
  expect(plan.length).toBe(1);
  return plan[0]!;
}

describe("planWindows — adaptive subdivision", () => {
  test("eighth-triplet onsets → a 3-cell tuplet (num 3, inSpace 2)", () => {
    const w = onlyWindow([0, 1 / 3, 2 / 3]);
    expect(w.cells).toBe(3);
    expect(w.tuplet).toEqual({ num: 3, inSpace: 2 });
  });

  test("clean sixteenths → a 4-cell binary window (NOT a tuplet)", () => {
    const w = onlyWindow([0, 0.25, 0.5, 0.75]);
    expect(w.cells).toBe(4);
    expect(w.tuplet).toBeUndefined();
  });

  test("thirty-second onsets → an 8-cell binary window", () => {
    const w = onlyWindow([0, 0.125, 0.25]);
    expect(w.cells).toBe(8);
    expect(w.tuplet).toBeUndefined();
  });

  test("a single onset at the beat start → the default 16th binary grid", () => {
    // One onset (a quarter note filling the beat). The run machinery collapses
    // the 4 cells back into one quarter downstream; the grid stays a forgiving
    // 16th, never a tuplet.
    const w = onlyWindow([0]);
    expect(w.cells).toBe(4);
    expect(w.tuplet).toBeUndefined();
  });

  test("a single MID-beat onset stays binary (the offset-noise regression)", () => {
    // A note sustained from the previous beat leaves this window with a single
    // onset at 0.5 (the next attack). Detection is onset-only, so there is no
    // off-grid release to masquerade as a tuplet — it must stay binary.
    const w = onlyWindow([0.5]);
    expect(w.cells).toBe(4);
    expect(w.tuplet).toBeUndefined();
  });

  test("a slightly-loose triplet is still detected as a tuplet (within TOL)", () => {
    const w = onlyWindow([0, 0.34, 0.66]);
    expect(w.cells).toBe(3);
    expect(w.tuplet).toEqual({ num: 3, inSpace: 2 });
  });

  test("an ordinary eighth stays binary on the 16th grid (not a tuplet)", () => {
    const w = onlyWindow([0, 0.5]);
    expect(w.cells).toBe(4);
    expect(w.tuplet).toBeUndefined();
  });

  test("covers the bar in order with integer-beat-aligned windows", () => {
    // A 4/4 bar with a triplet on beat 0 and plain notes after.
    const plan = planWindows([0, 1 / 3, 2 / 3, 1, 2, 3], 0, 4);
    expect(plan.length).toBe(4);
    expect(plan.map((w) => w.start)).toEqual([0, 1, 2, 3]);
    expect(plan.every((w) => w.len === 1)).toBe(true);
    expect(plan[0]!.cells).toBe(3);
    expect(plan[0]!.tuplet).toEqual({ num: 3, inSpace: 2 });
  });

  test("a trailing partial window (odd bar length) gets len < 1", () => {
    // A 5/8 bar = 2.5 quarter-beats: two full windows + a half-beat tail.
    const plan = planWindows([0, 1, 2], 0, 2.5);
    expect(plan.map((w) => w.start)).toEqual([0, 1, 2]);
    expect(plan.map((w) => w.len)).toEqual([1, 1, 0.5]);
  });
});
