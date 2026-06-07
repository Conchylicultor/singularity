/**
 * The chord vocabulary — the single home for Sonata's chord theory.
 *
 * Each quality maps to its interval set (semitones above the root, root
 * excluded) and a display-symbol suffix. Both directions of the two-layer model
 * use this table: the chord-analyzer matches sounding pitches *against* the
 * intervals (notes → chord), and chord-authoring sources build pitches *from*
 * them (chord → notes).
 *
 * Ordered most-specific (7ths) first so detection and suffix parsing prefer the
 * richer chord on ties.
 */

/** Pitch-class names. Index = MIDI pitch-class (0=C … 11=B). */
export const PC_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export interface ChordTemplate {
  /** Canonical quality id, e.g. "maj7", "min", "halfdim7". */
  quality: string;
  /** Symbol suffix appended after the root name, e.g. "maj7", "m", "ø7". */
  symbol: string;
  /** Semitones above the root, root excluded. */
  intervals: readonly number[];
}

export const CHORD_TEMPLATES: readonly ChordTemplate[] = [
  // ── 7th chords ───────────────────────────────────────────────────────────
  { quality: "maj7", symbol: "maj7", intervals: [4, 7, 11] },
  { quality: "dom7", symbol: "7", intervals: [4, 7, 10] },
  { quality: "min7", symbol: "m7", intervals: [3, 7, 10] },
  { quality: "minmaj7", symbol: "mM7", intervals: [3, 7, 11] },
  { quality: "halfdim7", symbol: "ø7", intervals: [3, 6, 10] },
  { quality: "dim7", symbol: "dim7", intervals: [3, 6, 9] },
  { quality: "augmaj7", symbol: "+M7", intervals: [4, 8, 11] },
  { quality: "aug7", symbol: "+7", intervals: [4, 8, 10] },
  // ── Triads ─────────────────────────────────────────────────────────────--
  { quality: "maj", symbol: "", intervals: [4, 7] },
  { quality: "min", symbol: "m", intervals: [3, 7] },
  { quality: "aug", symbol: "+", intervals: [4, 8] },
  { quality: "dim", symbol: "dim", intervals: [3, 6] },
  // ── Added-tone & extended chords ─────────────────────────────────────────
  // Authoring-oriented (chord → notes). They are intentionally listed last and
  // upper extensions use literal interval sizes (9th = 14, 13th = 21) so the
  // voicing spacing is correct. This also keeps them inert in `detectChord`:
  // extensions > 11 can never appear in its mod-12 relative-interval set, and
  // the 6th chords are always enharmonic to an earlier-listed min7 / halfdim7
  // inversion that ties or beats them — so detection is unchanged.
  { quality: "maj6", symbol: "6", intervals: [4, 7, 9] },
  { quality: "min6", symbol: "m6", intervals: [3, 7, 9] },
  { quality: "maj9", symbol: "maj9", intervals: [4, 7, 11, 14] },
  { quality: "dom9", symbol: "9", intervals: [4, 7, 10, 14] },
  { quality: "min9", symbol: "m9", intervals: [3, 7, 10, 14] },
  { quality: "dom13", symbol: "13", intervals: [4, 7, 10, 14, 21] },
];

const BY_QUALITY = new Map(CHORD_TEMPLATES.map((t) => [t.quality, t]));

/** Interval set (semitones above root, root excluded) for a chord quality. */
export function qualityToIntervals(quality: string): readonly number[] {
  const tmpl = BY_QUALITY.get(quality);
  if (!tmpl) {
    throw new Error(`[theory] unknown chord quality: ${quality}`);
  }
  return tmpl.intervals;
}

/** The symbol suffix for a quality (e.g. "min7" → "m7"). */
export function qualitySymbol(quality: string): string {
  const tmpl = BY_QUALITY.get(quality);
  if (!tmpl) {
    throw new Error(`[theory] unknown chord quality: ${quality}`);
  }
  return tmpl.symbol;
}

/** Display symbol for a chord, e.g. {root:0,quality:"min7"} → "Cm7". */
export function formatChordSymbol(data: {
  root: number;
  quality: string;
}): string {
  const root = PC_NAMES[((data.root % 12) + 12) % 12]!;
  return root + qualitySymbol(data.quality);
}
