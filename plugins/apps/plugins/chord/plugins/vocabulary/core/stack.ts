import {
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  CHORD_TEMPLATES,
  type ChordTemplate,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

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

// ── Reading a stack: the two questions everything else asks of it ────────────
//
// Both the Roman numeral (`label.ts`) and the letter name (`name.ts`) start by
// asking whether Sonata has a quality for this stack, and both fall back to
// spelling its tones out when it does not. They make the SAME call, so the two
// readings of one chord can never describe different chords.

/** The Sonata quality this stack is, or `undefined` when it is none of them. */
export function matchChordTemplate(
  stack: ChordStack,
): ChordTemplate | undefined {
  const above = stack.tones.slice(1);
  return CHORD_TEMPLATES.find(
    (template) =>
      template.intervals.length === above.length &&
      template.intervals.every((interval, i) => interval === above[i]),
  );
}

/**
 * A stack Sonata has no quality for, as chord members: "3,5,9". A lone root is
 * "1" — nothing sounds above it. Never refused: every stack spells out.
 */
export function spelledTones(stack: ChordStack): string {
  const above = stack.tones.slice(1).map(intervalName);
  return above.length === 0 ? "1" : above.join(",");
}

/** A tone above the root, as a chord member, within the octave and in the next one. */
const SIMPLE_INTERVAL_NAMES = [
  "1",
  "♭2",
  "2",
  "♭3",
  "3",
  "4",
  "♭5",
  "5",
  "♯5",
  "6",
  "♭7",
  "7",
] as const;
const COMPOUND_INTERVAL_NAMES = [
  "8",
  "♭9",
  "9",
  "♯9",
  "10",
  "11",
  "♯11",
  "12",
  "♭13",
  "13",
  "♭14",
  "14",
] as const;

/** A tone above the root. Beyond two octaves it is named by its place in the second: what the ear hears. */
function intervalName(semitones: number): string {
  const names =
    semitones < 12 ? SIMPLE_INTERVAL_NAMES : COMPOUND_INTERVAL_NAMES;
  const name = names[semitones % 12];
  if (name === undefined) throw new Error(`No name for ${semitones} semitones`);
  return name;
}
