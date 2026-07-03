/**
 * Functional-harmony analysis: a chord + the key it sits in → its Roman-numeral
 * label (I, ii, V7, ♭VII, vii°7, …).
 *
 * This is the third face of the two-layer chord model, alongside `formatChord-
 * Symbol` (chord → letter name) and `detectChord` (notes → chord): given the key
 * *context* it names a chord by its scale-degree *function* rather than its
 * absolute root. So the same Cmaj chord reads "I" in C major but "IV" in G major
 * and "♭VI" in E minor.
 *
 * The numeral is derived purely from the chord root's semitone interval above
 * the tonic, resolved through a fixed per-mode table of conventional readings —
 * NOT from the key speller — so a lowered-sixth chord reads the conventional
 * "♭VI" rather than the speller's enharmonic "♯V". The chord *quality* then only
 * decides the numeral's case (upper = major family, lower = minor/diminished), a
 * quality mark (° dim, ø half-dim, + aug), and a seventh/extension figure.
 *
 * Inversions are intentionally NOT figured here — the root-position function is
 * what the label conveys; the slash bass already shows in the chord symbol.
 *
 * Pure TypeScript: no React, no framework. Imports only `score/core` (types),
 * keeping the DAG acyclic.
 */

import type {
  ChordData,
  KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { tonicPc } from "./key-detect";

/** Roman-numeral glyph per 1-based diatonic degree. */
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

/** A degree reading: which numeral (1-based) and its chromatic accidental. */
interface Degree {
  /** 1-based diatonic degree → `NUMERALS[n - 1]`. */
  n: number;
  /** Chromatic offset from the diatonic degree: -1 = ♭, +1 = ♯, 0 = natural. */
  acc?: -1 | 1;
}

/**
 * Semitone interval above the tonic → conventional Roman degree, in a MAJOR key.
 * Diatonic degrees (0,2,4,5,7,9,11) read bare; chromatic roots take the
 * conventional pop/jazz reading — the raised fourth (♯IV, the tritone that
 * pulls to V) sharp, the borrowed thirds/sixths/sevenths (♭III ♭VI ♭VII) and the
 * Neapolitan (♭II) flat.
 */
const MAJOR_DEGREES: readonly Degree[] = [
  { n: 1 }, //  0  I
  { n: 2, acc: -1 }, //  1  ♭II
  { n: 2 }, //  2  II
  { n: 3, acc: -1 }, //  3  ♭III
  { n: 3 }, //  4  III
  { n: 4 }, //  5  IV
  { n: 4, acc: 1 }, //  6  ♯IV
  { n: 5 }, //  7  V
  { n: 6, acc: -1 }, //  8  ♭VI
  { n: 6 }, //  9  VI
  { n: 7, acc: -1 }, // 10  ♭VII
  { n: 7 }, // 11  VII
];

/**
 * Semitone interval above the tonic → conventional Roman degree, in a MINOR key.
 * The diatonic (natural-minor) degrees (0,2,3,5,7,8,10) read bare — so the minor
 * third, sixth and seventh are the plain III / VI / VII of the key — and the
 * chromatic degrees take the conventional readings (the raised leading tone ♯VII,
 * the raised sixth ♯VI of melodic minor, the ♯IV / Neapolitan ♭II).
 */
const MINOR_DEGREES: readonly Degree[] = [
  { n: 1 }, //  0  i
  { n: 2, acc: -1 }, //  1  ♭II
  { n: 2 }, //  2  ii
  { n: 3 }, //  3  III
  { n: 3, acc: 1 }, //  4  ♯III
  { n: 4 }, //  5  iv
  { n: 4, acc: 1 }, //  6  ♯iv
  { n: 5 }, //  7  v
  { n: 6 }, //  8  VI
  { n: 6, acc: 1 }, //  9  ♯vi
  { n: 7 }, // 10  VII
  { n: 7, acc: 1 }, // 11  ♯vii (leading tone)
];

/** How a chord quality cases and decorates its numeral. */
interface RomanStyle {
  /** Minor/diminished families are lowercase; major/augmented uppercase. */
  lower: boolean;
  /** Triad-quality mark: "°" diminished, "ø" half-diminished, "+" augmented. */
  mark?: string;
  /** Seventh / extension figure appended after the numeral (e.g. "7", "maj7"). */
  figure?: string;
}

/**
 * Per-quality styling, keyed by the canonical `ChordData.quality`. Mirrors the
 * chord vocabulary in `chords.ts` (every `CHORD_TEMPLATES` quality is covered),
 * but expressed as case + mark + figure so the numeral carries the same harmonic
 * information the chord suffix does.
 */
const STYLE: Record<string, RomanStyle> = {
  // Triads
  maj: { lower: false },
  min: { lower: true },
  aug: { lower: false, mark: "+" },
  dim: { lower: true, mark: "°" },
  // Sevenths
  maj7: { lower: false, figure: "maj7" },
  dom7: { lower: false, figure: "7" },
  min7: { lower: true, figure: "7" },
  minmaj7: { lower: true, figure: "maj7" },
  halfdim7: { lower: true, mark: "ø", figure: "7" },
  dim7: { lower: true, mark: "°", figure: "7" },
  augmaj7: { lower: false, mark: "+", figure: "maj7" },
  aug7: { lower: false, mark: "+", figure: "7" },
  // Sixths / added-tone / extended / suspended
  maj6: { lower: false, figure: "6" },
  min6: { lower: true, figure: "6" },
  maj9: { lower: false, figure: "maj9" },
  dom9: { lower: false, figure: "9" },
  min9: { lower: true, figure: "9" },
  dom13: { lower: false, figure: "13" },
  sus2: { lower: false, figure: "sus2" },
  sus4: { lower: false, figure: "sus4" },
  six9: { lower: false, figure: "6/9" },
};

/**
 * The Roman-numeral label for `chord` in `key`, e.g. `{root:7,quality:"dom7"}`
 * in C major → `"V7"`, `{root:9,quality:"min"}` in C major → `"vi"`, a B♭ major
 * chord in C major → `"♭VII"`. Returns `null` when the quality is outside the
 * vocabulary (so a caller simply omits the numeral rather than crashing).
 */
export function romanNumeral(
  chord: Pick<ChordData, "root" | "quality">,
  key: KeySignature,
): string | null {
  const style = STYLE[chord.quality];
  if (!style) return null;

  const interval = (((chord.root - tonicPc(key.tonic)) % 12) + 12) % 12;
  const degree = (key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES)[interval]!;

  const base = NUMERALS[degree.n - 1]!;
  const numeral = style.lower ? base.toLowerCase() : base;
  const accidental = degree.acc === undefined ? "" : degree.acc < 0 ? "♭" : "♯";

  return accidental + numeral + (style.mark ?? "") + (style.figure ?? "");
}
