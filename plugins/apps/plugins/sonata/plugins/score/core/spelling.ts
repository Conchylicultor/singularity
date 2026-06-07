/**
 * Key-signature-aware pitch spelling — pure music theory, no React.
 *
 * Given a `KeySignature`, decide how each MIDI pitch is spelled on the staff
 * (Eb vs D#, Cb vs B). The keyboard uses this to label its keys so accidentals
 * read in the key the score is written in; future displays (staff, chord
 * readout) can reuse it. With no key, `diatonic()` returns null everywhere and
 * `spell()` falls back to naturals + sharps (the chromatic default).
 *
 * Spelling is derived from the circle of fifths: a key's signed `fifths` from C
 * fixes which letters are sharp or flat, and the 7 diatonic letters cover all 7
 * letter names exactly once — so each in-key pitch-class has one spelling.
 */
import { effectiveKeyAt } from "./key-context";
import type { KeySignature, PitchSpelling, Score } from "./types";

type Step = PitchSpelling["step"];

/** Natural pitch-class of each letter (C=0 … B=11). */
const STEP_PC: Record<Step, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** White pitch-class → natural letter. */
const NATURAL_STEP: Record<number, Step> = {
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B",
};

/** Letters gain a sharp in this order as a key sharpens (F#, C#, G#, …). */
const SHARP_ORDER: readonly Step[] = ["F", "C", "G", "D", "A", "E", "B"];
/** Letters gain a flat in this order as a key flattens (Bb, Eb, Ab, …). */
const FLAT_ORDER: readonly Step[] = ["B", "E", "A", "D", "G", "C", "F"];

/** Circle-of-fifths position of each NATURAL letter, read as a major key. */
const LETTER_FIFTHS: Record<Step, number> = {
  F: -1,
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
};

const pc12 = (pitch: number): number => ((pitch % 12) + 12) % 12;

/** Signed position on the circle of fifths for a key (negative = flats). */
function keyFifths(key: KeySignature): number {
  const letter = key.tonic[0]?.toUpperCase() as Step | undefined;
  if (!letter || !(letter in LETTER_FIFTHS)) return 0;
  let accidentals = 0;
  for (const ch of key.tonic.slice(1)) {
    if (ch === "#" || ch === "♯") accidentals += 1;
    else if (ch === "b" || ch === "♭") accidentals -= 1;
  }
  // Each sharp/flat moves 7 steps along the circle; a minor key shares its
  // relative major's signature, 3 fifths flatter than the same-letter major.
  return (
    LETTER_FIFTHS[letter] + 7 * accidentals - (key.mode === "minor" ? 3 : 0)
  );
}

/** Scientific octave of a spelled pitch (the octave its NATURAL letter sits in). */
function octaveOf(pitch: number, alter: number): number {
  // The natural pitch of the step is `pitch - alter`; its octave is what the
  // staff shows (so Cb5 spelled from MIDI 71 stays a C-octave, not a B-octave).
  return Math.floor((pitch - alter) / 12) - 1;
}

export interface KeySpeller {
  /** Diatonic spelling for a pitch's pitch-class, or null when not in the key. */
  diatonic(pitch: number): { step: Step; alter: number } | null;
  /** A spelling for ANY pitch: diatonic when in-key, else key-oriented default. */
  spell(pitch: number): PitchSpelling;
}

/** Render an alteration as accidental glyph(s): -1 → "♭", +2 → "♯♯", 0 → "". */
export function accidentalGlyph(alter: number): string {
  if (alter === 0) return "";
  return (alter > 0 ? "♯" : "♭").repeat(Math.abs(alter));
}

/**
 * Build a speller for `key` (or a key-agnostic chromatic default when omitted).
 * Computes the 7-entry diatonic table once; `diatonic`/`spell` are O(1).
 */
export function makeKeySpeller(key?: KeySignature): KeySpeller {
  const fifths = key ? keyFifths(key) : 0;
  const sharps = Math.max(0, fifths);
  const flats = Math.max(0, -fifths);
  const prefersFlats = fifths < 0;

  // Diatonic table: pitch-class → {step, alter} for the 7 in-key letters. Only
  // populated when a key is given; with no key every pitch is "non-diatonic".
  const diatonicByPc = new Map<number, { step: Step; alter: number }>();
  if (key) {
    const sharped = new Set(SHARP_ORDER.slice(0, sharps));
    const flatted = new Set(FLAT_ORDER.slice(0, flats));
    for (const step of Object.keys(STEP_PC) as Step[]) {
      const alter = sharped.has(step) ? 1 : flatted.has(step) ? -1 : 0;
      diatonicByPc.set(pc12(STEP_PC[step] + alter), { step, alter });
    }
  }

  const diatonic = (pitch: number) => diatonicByPc.get(pc12(pitch)) ?? null;

  const spell = (pitch: number): PitchSpelling => {
    const dia = diatonic(pitch);
    if (dia) return { ...dia, octave: octaveOf(pitch, dia.alter) };
    // Non-diatonic: naturals keep their letter; accidentals lean with the key.
    const pc = pc12(pitch);
    const natural = NATURAL_STEP[pc];
    if (natural) return { step: natural, alter: 0, octave: octaveOf(pitch, 0) };
    if (prefersFlats) {
      const step = NATURAL_STEP[pc12(pitch + 1)]!; // letter above, flattened
      return { step, alter: -1, octave: octaveOf(pitch, -1) };
    }
    const step = NATURAL_STEP[pc12(pitch - 1)]!; // letter below, sharpened
    return { step, alter: 1, octave: octaveOf(pitch, 1) };
  };

  return { diatonic, spell };
}

/**
 * Fill in every note's `spelling` from the key in force at its onset.
 *
 * Most note sources emit `pitch` only and leave `spelling` undefined; this pass
 * resolves the staff spelling (Eb vs D#) from the key context via
 * `effectiveKeyAt`. Authored spelling is *preserved* — a note that already
 * carries a `spelling` (e.g. from a sheet-music source) is never re-spelled, so
 * authored truth always wins over inference.
 *
 * Pure: returns a new Score, never mutates the input.
 *
 * Performance: key changes are sparse, so we build at most one `KeySpeller` per
 * distinct in-effect key (keyed by a stable tonic|mode string, including the
 * no-key case as the empty key) rather than one speller per note.
 */
export function spellScore(score: Score): Score {
  const spellerByKey = new Map<string, KeySpeller>();
  const spellerFor = (key: KeySignature | undefined): KeySpeller => {
    const id = `${key?.tonic ?? ""}|${key?.mode ?? ""}`;
    let speller = spellerByKey.get(id);
    if (!speller) {
      speller = makeKeySpeller(key);
      spellerByKey.set(id, speller);
    }
    return speller;
  };

  const notes = score.notes.map((note) => {
    if (note.spelling) return note; // preserve authored spelling untouched.
    const key = effectiveKeyAt(score, note.start);
    return { ...note, spelling: spellerFor(key).spell(note.pitch) };
  });

  return { ...score, notes };
}
