import { describe, expect, it } from "bun:test";
import { emptyScore, leadInBeats } from "./helpers";
import type { Score, TimeSigEvent } from "./types";

/** A minimal score carrying just a time-sig map + one note, for the lead-in math. */
function scoreWith(timeSigMap: TimeSigEvent[]): Score {
  return { ...emptyScore(), timeSigMap, notes: [
    { id: "n", track: "t", pitch: 60, start: 0, duration: 1, velocity: 100 },
  ] };
}

describe("leadInBeats", () => {
  it("defaults to a 4/4 bar (4 quarter-note beats) when no time signature is declared", () => {
    expect(leadInBeats(scoreWith([]))).toBe(4);
  });

  it("derives the opening bar length from the first time signature", () => {
    // 3/4 → 3 quarter-note beats.
    expect(leadInBeats(scoreWith([{ beat: 0, numerator: 3, denominator: 4 }]))).toBe(3);
    // 6/8 → 6 × (4/8) = 3 quarter-note beats.
    expect(leadInBeats(scoreWith([{ beat: 0, numerator: 6, denominator: 8 }]))).toBe(3);
    // 7/8 → 7 × 0.5 = 3.5.
    expect(leadInBeats(scoreWith([{ beat: 0, numerator: 7, denominator: 8 }]))).toBe(3.5);
  });

  it("uses the EARLIEST time signature even if the map is unsorted", () => {
    expect(
      leadInBeats(
        scoreWith([
          { beat: 12, numerator: 3, denominator: 4 },
          { beat: 0, numerator: 2, denominator: 2 }, // opening bar: 2 × 2 = 4
        ]),
      ),
    ).toBe(4);
  });

  it("is 0 for an empty score (nothing to lead into)", () => {
    expect(leadInBeats(emptyScore())).toBe(4); // pure meter math…
    // …but the transport only applies it when scoreEndBeat > 0 (see context.tsx).
  });

  it("guards a degenerate non-positive meter back to a 4-beat bar", () => {
    expect(leadInBeats(scoreWith([{ beat: 0, numerator: 0, denominator: 4 }]))).toBe(4);
  });
});
