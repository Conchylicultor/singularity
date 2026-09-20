import {
  fifthsToTonic,
  tonicFifths,
  type KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  hookpadTonicPc,
  type HookpadMode,
} from "@plugins/integrations/plugins/hooktheory/core";

// ── The key a song is in ─────────────────────────────────────────────────────
//
// A loop window carries a tonic spelling ("Bb") and one of Hookpad's nine
// modes. Sonata's KeySignature is major or minor only, so a Dorian key has no
// direct spelling in it — but a modal key's SIGNATURE is its relative major's,
// and the signature is all a speller reads. So a song's key reaches Sonata as
// the major key that carries the same sharps and flats: D dorian as C major,
// E♭ mixolydian as A♭ major.

/** The key a song is written in, as Hookpad spells it. */
export type SongKey = {
  /** A tonic spelling: "C", "F#", "Bb". */
  tonic: string;
  mode: HookpadMode;
};

/**
 * How far each mode's signature sits from the same-tonic major, in fifths.
 *
 * A `Record` over the mode union, so a tenth Hookpad mode is a type error here
 * rather than a silently mis-spelled key.
 *
 * The two altered modes share their parent's entry — harmonic minor minor's,
 * phrygian dominant phrygian's — because the step they raise (the 7th, the 3rd)
 * is a non-diatonic accidental, not a change of signature: a score prints it as
 * an accidental on the note. `makeKeySpeller` spells a non-diatonic pitch
 * leaning with the key, which gets those raised steps right — A harmonic
 * minor's leading tone comes out G♯, C harmonic minor's B.
 */
const MODE_FIFTHS: Record<HookpadMode, number> = {
  lydian: 1,
  major: 0,
  mixolydian: -1,
  dorian: -2,
  minor: -3,
  harmonicMinor: -3,
  phrygian: -4,
  phrygianDominant: -4,
  locrian: -5,
};

/** Each mode as the learner reads it. A `Record`, for the same reason. */
const MODE_WORDS: Record<HookpadMode, string> = {
  major: "major",
  minor: "minor",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  locrian: "locrian",
  harmonicMinor: "harmonic minor",
  phrygianDominant: "phrygian dominant",
};

/** Accidentals as the app prints them, whichever way the tonic was written. */
const ACCIDENTAL_GLYPHS: Record<string, string> = {
  "#": "♯",
  b: "♭",
  "♯": "♯",
  "♭": "♭",
};

/**
 * The key signature this song is written in, as the equivalent major key —
 * what `makeKeySpeller` reads. D dorian ⇒ C major; E♭ mixolydian ⇒ A♭ major.
 *
 * Throws on a tonic the app cannot read: the circle arithmetic would otherwise
 * quietly answer C major for it, which is a claim about the song.
 */
export function songKeySignature(key: SongKey): KeySignature {
  assertTonic(key.tonic);
  return {
    tonic: fifthsToTonic(tonicFifths(key.tonic) + MODE_FIFTHS[key.mode]),
    mode: "major",
  };
}

/**
 * The key's tonic as a pitch class (0–11): what a chord token's root is
 * measured from, and therefore what a voicing is built on. The one reading of
 * it, so a surface naming a chord and a surface sounding it cannot start from
 * different tonics.
 */
export function songKeyTonicPc(key: SongKey): number {
  return hookpadTonicPc(key.tonic);
}

/** The key as the learner reads it: "G major", "E♭ mixolydian". */
export function songKeyLabel(key: SongKey): string {
  assertTonic(key.tonic);
  return `${glyphTonic(key.tonic)} ${MODE_WORDS[key.mode]}`;
}

/**
 * A tonic must be one the app can read — the letter-and-accidentals spellings
 * Hookpad's own keys use. Both readings of a key accept exactly the same ones,
 * so a key that names itself can also be spelled.
 */
function assertTonic(tonic: string): void {
  hookpadTonicPc(tonic); // Throws, naming the spelling, if it is not one.
}

/**
 * The tonic as written, with its accidentals as glyphs: "Bb" ⇒ "B♭". The
 * spelling is the song's own — a key written G♭ is not renamed F♯.
 */
function glyphTonic(tonic: string): string {
  const [letter = "", ...accidentals] = tonic;
  return letter + accidentals.map((ch) => ACCIDENTAL_GLYPHS[ch] ?? ch).join("");
}
