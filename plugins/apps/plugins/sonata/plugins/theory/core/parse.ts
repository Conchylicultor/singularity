/**
 * Forward chord parsing: a chord symbol string → `ChordData`.
 *
 * This is the inverse of the chord-analyzer's `detectChord` (notes → chord).
 * Chord-authoring sources (e.g. the chord grid) parse user-typed symbols like
 * `"Cmaj7"`, `"F#m"`, `"Bbdim7"` into `{ root, quality, symbol }`, then realise
 * them into notes via a voicing strategy.
 *
 * Returns `null` for anything that isn't a recognised chord, so callers can skip
 * (and surface) typos rather than crash on user input.
 */

import type { ChordData } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { qualitySymbol } from "./chords";

/** Note letter → natural pitch-class. */
const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Quality suffix → canonical quality, including common aliases. Matched
 * longest-first so `"maj7"`/`"m7"` win over `"m"`, and `"7"`/`""` map to the
 * dominant-7th / major triad respectively.
 */
const SUFFIX_TO_QUALITY: ReadonlyArray<{ suffix: string; quality: string }> = [
  // extended / added-tone chords (longest aliases first)
  { suffix: "major9", quality: "maj9" },
  { suffix: "maj9", quality: "maj9" },
  { suffix: "M9", quality: "maj9" },
  { suffix: "min9", quality: "min9" },
  { suffix: "m9", quality: "min9" },
  { suffix: "-9", quality: "min9" },
  { suffix: "9", quality: "dom9" },
  { suffix: "13", quality: "dom13" },
  { suffix: "min6", quality: "min6" },
  { suffix: "m6", quality: "min6" },
  { suffix: "-6", quality: "min6" },
  { suffix: "6", quality: "maj6" },
  // explicit aliases
  { suffix: "maj7", quality: "maj7" },
  { suffix: "major7", quality: "maj7" },
  { suffix: "M7", quality: "maj7" },
  { suffix: "min7", quality: "min7" },
  { suffix: "m7", quality: "min7" },
  { suffix: "-7", quality: "min7" },
  { suffix: "dom7", quality: "dom7" },
  { suffix: "7", quality: "dom7" },
  { suffix: "minmaj7", quality: "minmaj7" },
  { suffix: "mM7", quality: "minmaj7" },
  { suffix: "m7b5", quality: "halfdim7" },
  { suffix: "ø7", quality: "halfdim7" },
  { suffix: "ø", quality: "halfdim7" },
  { suffix: "dim7", quality: "dim7" },
  { suffix: "o7", quality: "dim7" },
  { suffix: "°7", quality: "dim7" },
  { suffix: "+M7", quality: "augmaj7" },
  { suffix: "augmaj7", quality: "augmaj7" },
  { suffix: "+7", quality: "aug7" },
  { suffix: "aug7", quality: "aug7" },
  { suffix: "dim", quality: "dim" },
  { suffix: "°", quality: "dim" },
  { suffix: "o", quality: "dim" },
  { suffix: "aug", quality: "aug" },
  { suffix: "+", quality: "aug" },
  { suffix: "min", quality: "min" },
  { suffix: "m", quality: "min" },
  { suffix: "-", quality: "min" },
  { suffix: "maj", quality: "maj" },
  { suffix: "major", quality: "maj" },
  { suffix: "", quality: "maj" },
];

const SUFFIXES_BY_LENGTH = [...SUFFIX_TO_QUALITY].sort(
  (a, b) => b.suffix.length - a.suffix.length,
);

/** Parse a chord symbol string into `ChordData`, or `null` if unrecognised. */
export function parseChordSymbol(input: string): ChordData | null {
  const s = input.trim();
  if (s.length === 0) return null;

  // Root: a letter A–G followed by any number of accidentals (# / b / ♯ / ♭).
  const m = /^([A-Ga-g])([#b♯♭]*)(.*)$/.exec(s);
  if (!m) return null;

  const letter = m[1]!.toUpperCase();
  const accidentals = m[2]!;
  const rest = m[3]!;

  let root = LETTER_PC[letter]!;
  for (const ch of accidentals) {
    if (ch === "#" || ch === "♯") root += 1;
    else if (ch === "b" || ch === "♭") root -= 1;
  }
  root = ((root % 12) + 12) % 12;

  // Quality: the whole remainder must equal a known suffix (longest-first).
  const match = SUFFIXES_BY_LENGTH.find((q) => q.suffix === rest);
  if (!match) return null;

  // Preserve the user's root spelling (so "Bbm7" stays "Bbm7", not "A#m7") and
  // append the canonical quality suffix.
  const rootText = letter + accidentals.replace(/♯/g, "#").replace(/♭/g, "b");
  return {
    root,
    quality: match.quality,
    symbol: rootText + qualitySymbol(match.quality),
  };
}
