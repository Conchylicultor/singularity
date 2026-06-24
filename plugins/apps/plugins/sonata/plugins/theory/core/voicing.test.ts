import { describe, expect, it } from "bun:test";
import { chordPitches, nearestVoicing } from "./voicing";

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
