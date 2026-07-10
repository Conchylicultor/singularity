/**
 * Functional harmony, both directions: a chord + the key it sits in ↔ its
 * Roman-numeral label (I, ii, V7, ♭VII, vii°7, …).
 *
 * This is the third face of the two-layer chord model, alongside `formatChord-
 * Symbol` (chord → letter name) and `detectChord` (notes → chord): given the key
 * *context* it names a chord by its scale-degree *function* rather than its
 * absolute root. So the same Cmaj chord reads "I" in C major but "IV" in G major
 * and "♭VI" in E minor.
 *
 * `romanNumeral` reads a chord as a numeral; `parseRomanNumeral` is its exact
 * inverse, resolving an authored numeral back to a concrete chord in the key —
 * so a chord-authoring source (the chord grid) can accept `I vi IV V` wherever
 * it accepts `C Am F G`. Both share one degree model and one quality table, and
 * the table is checked for injectivity at module eval, so the round-trip cannot
 * silently rot.
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
 * Pure TypeScript: no React, no framework. Imports only `score/core` and sibling
 * theory modules, keeping the DAG acyclic.
 */

import {
  makeKeySpeller,
  type ChordData,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatChordSymbol, formatSpelledChordSymbol } from "./chords";
import { tonicPc } from "./key-detect";

/** Roman-numeral glyph per 1-based diatonic degree. */
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

/** Reduce any integer to a pitch-class in [0, 12). */
const pc12 = (pc: number): number => ((pc % 12) + 12) % 12;

/** A degree reading: which numeral (1-based) and its chromatic accidental. */
interface Degree {
  /** 1-based diatonic degree → `NUMERALS[n - 1]`. */
  n: number;
  /** Chromatic offset from the diatonic degree: -1 = ♭, +1 = ♯, 0 = natural. */
  acc?: -1 | 1;
}

/**
 * Semitones above the tonic of each diatonic degree, per mode — the *forward*
 * degree model (`degree + accidental → interval`) that `parseRomanNumeral` reads.
 * The `*_DEGREES` tables below are its inverse (`interval → degree`), picking one
 * conventional spelling per chromatic interval; `roman.test.ts` asserts the two
 * agree, so the numeral round-trip is total.
 */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10] as const; // natural minor

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

  const interval = pc12(chord.root - tonicPc(key.tonic));
  const degree = (key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES)[interval]!;

  const base = NUMERALS[degree.n - 1]!;
  const numeral = style.lower ? base.toLowerCase() : base;
  const accidental = degree.acc === undefined ? "" : degree.acc < 0 ? "♭" : "♯";

  return accidental + numeral + (style.mark ?? "") + (style.figure ?? "");
}

// ---------------------------------------------------------------------------
// The inverse: numeral + key → chord
// ---------------------------------------------------------------------------

/** A style triple, flattened to a lookup key: case + mark + figure. */
function styleKey(lower: boolean, mark: string, figure: string): string {
  return `${lower ? "l" : "u"}|${mark}|${figure}`;
}

/**
 * `STYLE` inverted — the numeral's case + mark + figure back to the quality that
 * produced it. Built at module eval, which **throws if two qualities share a
 * style**: `romanNumeral` would then be non-injective and no parser could undo
 * it. The invariant is enforced where it can't be forgotten, not tested for.
 */
const QUALITY_BY_STYLE = new Map<string, string>();
for (const [quality, style] of Object.entries(STYLE)) {
  const k = styleKey(style.lower, style.mark ?? "", style.figure ?? "");
  const clash = QUALITY_BY_STYLE.get(k);
  if (clash) {
    throw new Error(
      `[theory] Roman-numeral style collision: "${quality}" and "${clash}" both render as ${k}`,
    );
  }
  QUALITY_BY_STYLE.set(k, quality);
}

/** Numeral glyph → 1-based diatonic degree (the inverse of `NUMERALS`). */
const DEGREE_BY_NUMERAL = new Map<string, number>(
  NUMERALS.map((glyph, i) => [glyph, i + 1]),
);

/**
 * Accepted spellings of a triad-quality mark, longest-first so `dim` is read
 * whole rather than as a `d` typo. `°`/`o`/`dim` are the diminished spellings,
 * `ø` half-diminished, `+` augmented.
 */
const MARK_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["dim", "°"],
  ["°", "°"],
  ["o", "°"],
  ["ø", "ø"],
  ["+", "+"],
];

/** Accepted spellings of a seventh/extension figure, normalized to `STYLE`'s. */
const FIGURE_ALIASES: Record<string, string> = { M7: "maj7", M9: "maj9" };

/**
 * A numeral: an optional chromatic accidental, then I–VII in a *uniform* case
 * (upper = major family, lower = minor/diminished), then the mark + figure tail.
 */
const ROMAN = /^([♭♯b#]?)([IViv]+)(.*)$/;

/** Split the tail into its (normalized) quality mark and figure. */
function splitTail(tail: string): { mark: string; figure: string } {
  const alias = MARK_ALIASES.find(([spelling]) => tail.startsWith(spelling));
  const mark = alias ? alias[1] : "";
  const rest = alias ? tail.slice(alias[0].length) : tail;
  return { mark, figure: FIGURE_ALIASES[rest] ?? rest };
}

/**
 * Resolve an authored Roman numeral to the concrete chord it names in `key` —
 * the exact inverse of `romanNumeral`. `"vi"` in C major → A minor, `"V7"` in
 * F major → C7, `"♭VII"` in C major → B♭ major, `"iiø7"` → a half-diminished ii.
 *
 * The root is the numeral's diatonic degree in the key's scale (natural minor
 * for a minor key, so `VI` in A minor is F — not F♯) shifted by the leading
 * accidental; the quality is whatever `romanNumeral` would have rendered as this
 * case + mark + figure. ASCII stand-ins are accepted for the glyphs (`b`/`#` for
 * `♭`/`♯`, `o`/`dim` for `°`, `M7` for `maj7`).
 *
 * The chord is spelled through the key (`spelledSymbol`) as well as normalized
 * to sharps (`symbol`), so `♭VII` in F major reads "E♭" rather than "D♯".
 *
 * Returns `null` for anything that is not a Roman numeral in this vocabulary, so
 * callers can fall through to the letter-name parser (`parseChordSymbol`) or
 * surface the token as a typo — never crash on user input.
 */
export function parseRomanNumeral(
  input: string,
  key: KeySignature,
): ChordData | null {
  const m = ROMAN.exec(input.trim());
  if (!m) return null;

  // A numeral is written in ONE case — its case IS the quality. `Iv` is a typo.
  const numeral = m[2]!;
  const lower = numeral === numeral.toLowerCase();
  const upper = numeral === numeral.toUpperCase();
  if (lower === upper) return null;

  const n = DEGREE_BY_NUMERAL.get(numeral.toUpperCase());
  if (n === undefined) return null; // e.g. "IIII", "VV"

  const { mark, figure } = splitTail(m[3]!);
  const quality = QUALITY_BY_STYLE.get(styleKey(lower, mark, figure));
  if (quality === undefined) return null;

  const accText = m[1]!;
  const acc = accText === "" ? 0 : accText === "♯" || accText === "#" ? 1 : -1;
  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const root = pc12(tonicPc(key.tonic) + scale[n - 1]! + acc);

  const symbol = formatChordSymbol({ root, quality });
  const spelledSymbol = formatSpelledChordSymbol(
    { root, quality },
    makeKeySpeller(key),
  );
  const data: ChordData = { root, quality, symbol };
  if (spelledSymbol !== symbol) data.spelledSymbol = spelledSymbol;
  return data;
}
