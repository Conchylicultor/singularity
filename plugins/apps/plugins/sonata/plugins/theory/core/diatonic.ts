/**
 * The chords of a key: each scale degree's chord, built by stacking the scale's
 * own thirds (natural minor for a minor key), so the qualities fall out of the
 * scale rather than a hand-written per-mode list — C major yields C Dm Em F G Am
 * Bdim, A minor Am Bdim C Dm Em F G.
 *
 * Each chord is a full `ChordData`, filled the way `parseRomanNumeral` fills one
 * (normalized `symbol`, key-spelled `spelledSymbol` only when it differs), and
 * carries its Roman numeral in the key.
 *
 * Pure TypeScript: no React, no framework.
 */

import {
  makeKeySpeller,
  type ChordData,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  CHORD_TEMPLATES,
  formatChordSymbol,
  formatSpelledChordSymbol,
} from "./chords";
import { tonicPc } from "./key-detect";
import { romanNumeral } from "./roman";
import { scaleOf } from "./scale";

export interface DiatonicChord {
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  chord: ChordData;
  /** Roman numeral in the key, e.g. "ii", "vii°", "V7". */
  numeral: string;
}

const DEGREES = [1, 2, 3, 4, 5, 6, 7] as const;

/** Interval-set signature → quality, over the whole chord vocabulary. */
const QUALITY_BY_INTERVALS = new Map<string, string>();
for (const t of CHORD_TEMPLATES) {
  const sig = t.intervals.join(",");
  // First template wins — the vocabulary is ordered most-specific first.
  if (!QUALITY_BY_INTERVALS.has(sig)) QUALITY_BY_INTERVALS.set(sig, t.quality);
}

/**
 * The seven diatonic chords of `key`, degree 1 → 7: triads by default, seventh
 * chords with `sevenths`. Qualities come from matching the stacked thirds
 * against `CHORD_TEMPLATES` (maj/min/dim, or maj7/dom7/min7/halfdim7 — and
 * whatever else the stacked intervals name), so a scale that ever stacks to a
 * chord outside the vocabulary throws rather than mislabelling it.
 */
export function diatonicChords(
  key: KeySignature,
  opts?: { sevenths?: boolean },
): DiatonicChord[] {
  const scale = scaleOf(key.mode);
  const tonic = tonicPc(key.tonic);
  const speller = makeKeySpeller(key);
  // Scale steps above the chord root: the third, fifth (and seventh).
  const steps = opts?.sevenths ? [2, 4, 6] : [2, 4];

  return DEGREES.map((degree) => {
    const i = degree - 1;
    const rootOffset = scale[i]!;
    const intervals = steps.map((s) => {
      const j = i + s;
      // Wrapping past the octave adds 12 to keep the stack ascending.
      return scale[j % 7]! + 12 * Math.floor(j / 7) - rootOffset;
    });
    const sig = intervals.join(",");
    const quality = QUALITY_BY_INTERVALS.get(sig);
    if (quality === undefined) {
      throw new Error(
        `[theory] diatonic stack [${sig}] names no chord quality`,
      );
    }

    const root = (tonic + rootOffset) % 12;
    const symbol = formatChordSymbol({ root, quality });
    const spelledSymbol = formatSpelledChordSymbol({ root, quality }, speller);
    const chord: ChordData = { root, quality, symbol };
    if (spelledSymbol !== symbol) chord.spelledSymbol = spelledSymbol;

    const numeral = romanNumeral(chord, key);
    if (numeral === null) {
      throw new Error(
        `[theory] no Roman numeral for diatonic quality "${quality}"`,
      );
    }
    return { degree, chord, numeral };
  });
}
