import { describe, expect, test } from "bun:test";

import {
  chordPitches,
  invertVoicing,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

import { READOUT_WINDOW, fitVoicings } from "./fit-voicings";

/** Every inversion of a chord (index 0 = root position), as chord-readout draws them. */
function inversions(root: number, quality: string): number[][] {
  const pitches = chordPitches({ root, quality });
  return pitches.map((_, k) => invertVoicing(pitches, k));
}

/** The shift fitVoicings applied, read off the first note. */
function shiftOf(input: number[][], output: number[][]): number {
  return output[0]![0]! - input[0]![0]!;
}

describe("fitVoicings", () => {
  test("C major's inversions stay in the default two-octave window", () => {
    const input = inversions(0, "maj");
    const fit = fitVoicings(input);
    expect(fit.low).toBe(60);
    expect(fit.high).toBe(83);
    expect(fit.voicings).toEqual(input);
  });

  test("C7's inversions stay in the default two-octave window", () => {
    const fit = fitVoicings(inversions(0, "dom7"));
    expect(fit.low).toBe(READOUT_WINDOW.low);
    expect(fit.high).toBe(READOUT_WINDOW.high);
  });

  test("any root-position triad or seventh stays in 60..83", () => {
    for (const quality of [
      "maj",
      "min",
      "dim",
      "aug",
      "dom7",
      "maj7",
      "min7",
    ]) {
      for (let root = 0; root < 12; root++) {
        const fit = fitVoicings([chordPitches({ root, quality })]);
        expect([fit.low, fit.high]).toEqual([60, 83]);
        for (const p of fit.voicings[0]!) {
          expect(p).toBeGreaterThanOrEqual(60);
          expect(p).toBeLessThanOrEqual(83);
        }
      }
    }
  });

  test("a wide chord's inversions widen the window by whole octaves", () => {
    // G7's inversions cover G…D two octaves up (19 semitones from a G), and
    // no octave shift slides that inside C4–B5.
    const fit = fitVoicings(inversions(7, "dom7"));
    expect(fit.high - fit.low + 1).toBeGreaterThan(24);
    expect(Math.abs((fit.low - READOUT_WINDOW.low) % 12)).toBe(0);
    expect(Math.abs((fit.high - READOUT_WINDOW.high) % 12)).toBe(0);
    const all = fit.voicings.flat();
    expect(Math.min(...all)).toBeGreaterThanOrEqual(fit.low);
    expect(Math.max(...all)).toBeLessThanOrEqual(fit.high);
  });

  test("the shift is always a whole number of octaves, shared by every voicing", () => {
    for (const quality of ["maj", "min7", "dom7"]) {
      for (let root = 0; root < 12; root++) {
        const input = inversions(root, quality);
        const fit = fitVoicings(input);
        const shift = shiftOf(input, fit.voicings);
        expect(Math.abs(shift % 12)).toBe(0);
        fit.voicings.forEach((v, i) =>
          v.forEach((p, j) => expect(p - input[i]![j]!).toBe(shift)),
        );
      }
    }
  });

  test("a voicing far from the window is octave-shifted into it", () => {
    const fit = fitVoicings([[24, 28, 31]]);
    expect([fit.low, fit.high]).toEqual([60, 83]);
    expect(fit.voicings[0]![0]! % 12).toBe(0);
    expect(fit.voicings[0]![0]!).toBeGreaterThanOrEqual(60);
  });

  test("no voicings: the window as given, nothing lit", () => {
    expect(fitVoicings([])).toEqual({ low: 60, high: 83, voicings: [] });
  });
});
