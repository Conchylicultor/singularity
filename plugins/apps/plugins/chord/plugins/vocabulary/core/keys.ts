import {
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── Which key on the keyboard answers a chord ────────────────────────────────
//
// The learner presses the number of the chord's root, the way they would read
// it off the page: ♭VII is on the 7 key, ♯IV on the 4 key. The accidental never
// changes the key — only the letter does — so every chord has one, which is
// what `chordDegree` could not promise (it has nothing to say about a root
// outside the major scale).
//
// Several unlocked chords can share a digit (V and V7 are both a 5). The first
// press then lights that digit's chords, numbered 1…n, and a second key picks
// one. `chordKeyPlan` is that grouping.

/** The key that answers a chord: the root's letter degree. */
export type ChordDigit = "1" | "2" | "3" | "4" | "5" | "6" | "7";

/**
 * The letter degree of each semitone above the tonic. Reads the same as
 * `SCALE_DEGREE_NAMES` in `label.ts` with its accidental dropped: ♭2 and 2 are
 * both a 2, ♯4 and 4 both a 4.
 */
const LETTER_DEGREE = [
  "1",
  "2",
  "2",
  "3",
  "3",
  "4",
  "4",
  "5",
  "6",
  "6",
  "7",
  "7",
] as const satisfies readonly ChordDigit[];

/** The key that answers this chord, "1" to "7". Every chord has one. */
export function chordDigit(token: ChordToken): ChordDigit {
  const { root } = parseChordToken(token);
  const digit = LETTER_DEGREE[root];
  if (digit === undefined) {
    throw new Error(`A chord token's root is 0–11, got ${root}`);
  }
  return digit;
}

/** The chords one digit answers, in the order they were given. */
export type ChordKeyGroup = {
  digit: ChordDigit;
  /** At least one. Several means the digit needs a second key to pick. */
  tokens: ChordToken[];
};

/**
 * The unlocked chords grouped by the key that answers them, digits ascending
 * and the chords of a digit in the order `unlocked` gave them (the unlock
 * order, so a new chord joins at the end of its digit).
 *
 * A digit no unlocked chord sits on is left out entirely: pressing it answers
 * nothing.
 */
export function chordKeyPlan(unlocked: readonly ChordToken[]): ChordKeyGroup[] {
  const byDigit = new Map<ChordDigit, ChordToken[]>();
  for (const token of unlocked) {
    const digit = chordDigit(token);
    const group = byDigit.get(digit);
    if (group === undefined) byDigit.set(digit, [token]);
    else group.push(token);
  }
  return [...byDigit.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([digit, tokens]) => ({ digit, tokens }));
}
