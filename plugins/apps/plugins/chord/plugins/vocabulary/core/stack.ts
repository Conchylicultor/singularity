import {
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

/** A token read as a stack of tones, which is what naming and voicing both need. */
export type ChordStack = {
  /** Semitones from the tonic up to the root, 0–11. */
  root: number;
  /** Each tone as semitones above the root, root first (0), ascending. */
  tones: number[];
  /** Which tone of `tones` is in the bass. */
  bassIndex: number;
};

/**
 * The tones of a token, and which one is in the bass.
 *
 * A token keeps the root-position stack but not which chord degree each tone
 * is, so the inversion counts the stack's tones from the bottom: 1 is the
 * second tone, 2 the third. When it runs past the top (a seventh chord with
 * its 5th omitted, in third inversion) the top tone is in the bass, which is
 * the 7th Hookpad meant.
 */
export function chordStack(token: ChordToken): ChordStack {
  const { root, intervals, inversion } = parseChordToken(token);
  const tones = [0];
  let above = 0;
  for (const interval of intervals) {
    above += interval;
    tones.push(above);
  }
  return {
    root,
    tones,
    bassIndex: Math.min(inversion, tones.length - 1),
  };
}

export const pc12 = (n: number): number => ((n % 12) + 12) % 12;
