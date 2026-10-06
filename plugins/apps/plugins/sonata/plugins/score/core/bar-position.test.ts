import { describe, expect, it } from "bun:test";
import { barPositionAt, barStartBeat } from "./bar-position";
import { emptyScore } from "./helpers";
import type { Score, TimeSigEvent } from "./types";

/** A score spanning `[0, end)` with the given meter map and optional pickup. */
function scoreWith(
  timeSigMap: TimeSigEvent[],
  end: number,
  pickupBeats?: number,
): Score {
  return {
    ...emptyScore(),
    meta: pickupBeats === undefined ? {} : { pickupBeats },
    timeSigMap,
    notes: [
      {
        id: "n",
        track: "t",
        pitch: 60,
        start: 0,
        duration: end,
        velocity: 100,
      },
    ],
  };
}

describe("barStartBeat", () => {
  it("numbers bars from 1 in 4/4", () => {
    const s = scoreWith([], 16);
    expect(barStartBeat(s, 1)).toBe(0);
    expect(barStartBeat(s, 3)).toBe(8);
  });

  it("follows a meter change: 2 bars of 4/4 then 6/8", () => {
    const s = scoreWith(
      [
        { beat: 0, numerator: 4, denominator: 4 },
        { beat: 8, numerator: 6, denominator: 8 },
      ],
      20,
    );
    expect(barStartBeat(s, 3)).toBe(8);
    // 6/8 bars are 3 quarter-note beats long.
    expect(barStartBeat(s, 4)).toBe(11);
    expect(barStartBeat(s, 5)).toBe(14);
  });

  it("counts a pickup as bar 0", () => {
    const s = scoreWith([], 17, 1);
    expect(barStartBeat(s, 0)).toBe(0);
    expect(barStartBeat(s, 1)).toBe(1);
    expect(barStartBeat(s, 2)).toBe(5);
  });

  it("clamps past the last bar and before the first", () => {
    const s = scoreWith([], 16);
    expect(barStartBeat(s, 999)).toBe(16);
    expect(barStartBeat(s, 0)).toBe(0);
    expect(barStartBeat(s, -3)).toBe(0);
  });

  it("throws on a fractional bar", () => {
    expect(() => barStartBeat(scoreWith([], 16), 1.5)).toThrow();
  });
});

describe("barPositionAt", () => {
  it("reads bar.beat in 4/4, and the lead-in as 1.1", () => {
    const s = scoreWith([], 16);
    expect(barPositionAt(s, -4)).toEqual({ bar: 1, beat: 1 });
    expect(barPositionAt(s, 0)).toEqual({ bar: 1, beat: 1 });
    expect(barPositionAt(s, 6.5)).toEqual({ bar: 2, beat: 3 });
  });

  it("counts beats in the bar's own meter unit (eighths in 6/8)", () => {
    const s = scoreWith(
      [
        { beat: 0, numerator: 4, denominator: 4 },
        { beat: 8, numerator: 6, denominator: 8 },
      ],
      20,
    );
    expect(barPositionAt(s, 12)).toEqual({ bar: 4, beat: 3 });
  });

  it("round-trips with barStartBeat", () => {
    const s = scoreWith([{ beat: 0, numerator: 3, denominator: 4 }], 30, 2);
    for (const bar of [0, 1, 4, 7]) {
      expect(barPositionAt(s, barStartBeat(s, bar))).toEqual({ bar, beat: 1 });
    }
  });
});
