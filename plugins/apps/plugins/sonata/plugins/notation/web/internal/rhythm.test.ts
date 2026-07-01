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

  test("quarter-note triplet over 2 beats → one 2-beat 3-tuplet window", () => {
    // Three onsets spread evenly across 2 real beats — a quarter-note triplet.
    const plan = planWindows([0, 2 / 3, 4 / 3], 0, 4);
    expect(plan[0]).toEqual({
      start: 0,
      len: 2,
      cells: 3,
      tuplet: { num: 3, inSpace: 2 },
    });
  });

  test("half-note triplet over 4 beats → a single 4-beat 3-tuplet window", () => {
    // Three onsets evenly across the whole 4/4 bar — a half-note triplet.
    const plan = planWindows([0, 4 / 3, 8 / 3], 0, 4);
    expect(plan.length).toBe(1);
    expect(plan[0]).toEqual({
      start: 0,
      len: 4,
      cells: 3,
      tuplet: { num: 3, inSpace: 2 },
    });
  });

  test("quintuplet in a beat → a 5-cell tuplet (num 5, inSpace 4)", () => {
    const w = onlyWindow([0, 0.2, 0.4, 0.6, 0.8]);
    expect(w.cells).toBe(5);
    expect(w.tuplet).toEqual({ num: 5, inSpace: 4 });
  });

  test("septuplet in a beat → a 7-cell tuplet (num 7, inSpace 4)", () => {
    const w = onlyWindow([0, 1, 2, 3, 4, 5, 6].map((k) => k / 7));
    expect(w.cells).toBe(7);
    expect(w.tuplet).toEqual({ num: 7, inSpace: 4 });
  });

  test("32nd-triplet (12) in a beat → a 12-cell tuplet (num 12, inSpace 8)", () => {
    const w = onlyWindow([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => k / 12));
    expect(w.cells).toBe(12);
    expect(w.tuplet).toEqual({ num: 12, inSpace: 8 });
  });

  test("two eighth-triplets over 2 beats stay two 1-beat triplets (not a 6/12)", () => {
    // Six evenly-spaced onsets across 2 beats read as two per-beat eighth-
    // triplets, NOT one multi-beat sextuplet — even ratios never group.
    const plan = planWindows([0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3], 0, 4);
    expect(plan[0]).toEqual({
      start: 0,
      len: 1,
      cells: 3,
      tuplet: { num: 3, inSpace: 2 },
    });
    expect(plan[1]).toEqual({
      start: 1,
      len: 1,
      cells: 3,
      tuplet: { num: 3, inSpace: 2 },
    });
  });
});
