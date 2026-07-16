import { describe, expect, it } from "bun:test";
import { chordPitches, invertVoicing, nearestVoicing } from "./voicing";
import { parseChordSymbol } from "./parse";

/** Pitch-class of each voicing's bass, in inversion order. */
const bassPcs = (pitches: number[]): number[] =>
  pitches.map((_, k) => invertVoicing(pitches, k)[0]! % 12);

/**
 * A C → G → Am → F progression (roots 0, 7, 9, 5; all major except Am).
 * Root-position voicings of these chords jump around the keyboard; nearest-
 * voicing should keep each chord within a tight register of the previous one.
 */
const PROGRESSION: { root: number; quality: string }[] = [
  { root: 0, quality: "maj" }, // C
  { root: 7, quality: "maj" }, // G
  { root: 9, quality: "min" }, // Am
  { root: 5, quality: "maj" }, // F
];

/** Max absolute pitch jump between the spans of consecutive chord voicings. */
function maxConsecutiveSpan(voicings: number[][]): number {
  let worst = 0;
  for (let i = 1; i < voicings.length; i++) {
    const prev = voicings[i - 1]!;
    const cur = voicings[i]!;
    const lo = Math.min(...prev, ...cur);
    const hi = Math.max(...prev, ...cur);
    worst = Math.max(worst, hi - lo);
  }
  return worst;
}

describe("nearestVoicing", () => {
  it("returns root position unchanged for the first chord (prev null)", () => {
    const tones = chordPitches(PROGRESSION[0]!, 4);
    expect(nearestVoicing(tones, null)).toEqual([...tones].sort((a, b) => a - b));
  });

  it("voice-leads a C→G→Am→F progression within a tight register window", () => {
    const rootPos = PROGRESSION.map((c) => chordPitches(c, 4));

    let prev: number[] | null = null;
    const voiced = rootPos.map((tones) => {
      const v = nearestVoicing(tones, prev);
      prev = v;
      return v;
    });

    // Voice-led: consecutive chords share a tight register.
    expect(maxConsecutiveSpan(voiced)).toBeLessThanOrEqual(12);

    // Always-root-position spreads much wider across consecutive chords.
    expect(maxConsecutiveSpan(rootPos)).toBeGreaterThan(maxConsecutiveSpan(voiced));
  });

  it("preserves the pitch-class set (octave/inversion choice only)", () => {
    const tones = chordPitches(PROGRESSION[1]!, 4);
    const prev = nearestVoicing(chordPitches(PROGRESSION[0]!, 4), null);
    const v = nearestVoicing(tones, prev);
    const pcs = (xs: number[]) => [...new Set(xs.map((p) => ((p % 12) + 12) % 12))].sort();
    expect(pcs(v)).toEqual(pcs(tones));
  });
});

describe("invertVoicing", () => {
  it("rotates a triad through close-position inversions", () => {
    // C major: [60,64,67] → 1st [64,67,72], 2nd [67,72,76].
    expect(invertVoicing([60, 64, 67], 0)).toEqual([60, 64, 67]);
    expect(invertVoicing([60, 64, 67], 1)).toEqual([64, 67, 72]);
    expect(invertVoicing([60, 64, 67], 2)).toEqual([67, 72, 76]);
  });

  it("puts each successive chord tone in the bass, exactly once", () => {
    // A 7th chord's stack fits inside an octave — every inversion is a distinct
    // bass, ascending through the chord tones.
    const bm7 = chordPitches(parseChordSymbol("Bm7")!);
    expect(bassPcs(bm7)).toEqual([11, 2, 6, 9]); // B, D, F#, A
  });

  it("inverts a chord whose stack spans past an octave (the ♭9 case)", () => {
    // Bm7(♭9) = [B4 D5 F#5 A5 C6]; the ♭9 sits 13 semitones up. Lifting the bass
    // by a FIXED octave would land B4 on B5 — below that C6 — leaving B in the
    // bass and losing the C-bass inversion entirely.
    const pitches = chordPitches(parseChordSymbol("Bm7(b9)")!);
    expect(pitches).toEqual([71, 74, 78, 81, 84]);
    expect(bassPcs(pitches)).toEqual([11, 2, 6, 9, 0]); // B, D, F#, A, C

    expect(invertVoicing(pitches, 1)).toEqual([74, 78, 81, 84, 95]);
    expect(invertVoicing(pitches, 4)).toEqual([84, 95, 98, 102, 105]);
  });

  it("gives every chord tone of a 13th chord its own inversion", () => {
    // dom13 spans 21 semitones — two tones (the 9th and 13th) sit past the
    // octave, so a fixed-octave lift collapsed the top three inversions onto a
    // root bass.
    const c13 = chordPitches(parseChordSymbol("C13")!);
    expect(bassPcs(c13)).toEqual([0, 4, 7, 10, 2, 9]); // C, E, G, B♭, D, A
  });

  it("preserves the pitch-class set and stays ascending for every k", () => {
    for (const symbol of ["C", "Bm7", "Bm7(b9)", "Cmaj9", "C13", "Eb6/9"]) {
      const pitches = chordPitches(parseChordSymbol(symbol)!);
      const pcs = (xs: number[]) => [...new Set(xs.map((p) => p % 12))].sort();
      for (let k = 0; k < pitches.length; k++) {
        const inv = invertVoicing(pitches, k);
        expect(pcs(inv)).toEqual(pcs(pitches));
        expect(inv).toEqual([...inv].sort((a, b) => a - b));
      }
    }
  });

  it("returns a single note (or nothing) unchanged", () => {
    expect(invertVoicing([60], 1)).toEqual([60]);
    expect(invertVoicing([], 1)).toEqual([]);
  });
});

describe("chordPitches", () => {
  it("derives intervals from `quality` when none are given", () => {
    // C major triad at octave 4 → 60, 64, 67.
    expect(chordPitches({ root: 0, quality: "maj" }, 4)).toEqual([60, 64, 67]);
  });

  it("prefers an explicit realised interval set (altered chords)", () => {
    // G7(♯5): root 7 → base 67, intervals [4,8,10] → sounds the D♯ (75), not D.
    expect(
      chordPitches({ root: 7, quality: "dom7", intervals: [4, 8, 10] }, 4),
    ).toEqual([67, 71, 75, 77]);
  });
});
