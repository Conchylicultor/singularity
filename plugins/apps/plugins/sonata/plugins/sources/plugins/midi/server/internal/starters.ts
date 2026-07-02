/**
 * Bundled starter songs, defined as note arrays of public-domain repertoire. The
 * boot seed (`seed.ts`) turns each into a real multi-track MIDI attachment via
 * `@tonejs/midi` — no binary blobs in the repo, no licensing concerns.
 *
 * `time` and `duration` are in **seconds**; the seed sets the track tempo to
 * `bpm` (which only affects the MIDI's beat↔seconds header, not these absolute
 * seconds). `midi` is the MIDI note number (C4 = 60). `velocity` is optional on
 * the canonical 0–127 MIDI scale (defaults to the library's own default when
 * omitted) — the realistic pieces set it so a soft left-hand sits under a
 * brighter melody.
 *
 * A starter is **multi-track**: each `StarterTrack` becomes its own MIDI track
 * (piano-roll color + audio route), and a two-hand piano piece (left/right
 * tracks) engraves as a real grand staff in the notation lens.
 */

export interface StarterNote {
  midi: number;
  time: number;
  duration: number;
  /** Canonical MIDI velocity (0–127). Omit to use the default. */
  velocity?: number;
}

/**
 * A sustain-pedal press, in **seconds** (like `StarterNote.time`). Written to
 * the generated MIDI as CC64 down (`down`) / up (`up`) events, so it round-trips
 * through the exact same importer path as a real `.mid` — no special-casing.
 */
export interface StarterPedalSpan {
  down: number;
  up: number;
}

export interface StarterTrack {
  /** Track name, surfaced per-track (e.g. "Left hand"). */
  name?: string;
  /** General MIDI program number (0 = Acoustic Grand Piano). */
  program?: number;
  notes: StarterNote[];
  /**
   * Optional sustain-pedal (CC64) spans for this track, in seconds. Omit for an
   * unpedalled track. A two-hand piano piece pedals both hands with the same
   * spans (one physical pedal, per-track CC64 lanes).
   */
  pedal?: readonly StarterPedalSpan[];
}

export interface Starter {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  /** Optional time signature [numerator, denominator]; defaults to 4/4. */
  timeSig?: [numerator: number, denominator: number];
  tracks: StarterTrack[];
}

// --- Absolute-placement helper ---------------------------------------------
// `placed` positions each note at an explicit quarter-note `beat`, so notes may
// sit off the binary grid (triplets, 32nds) and overlap (a grace note just
// before its principal). Used
// by the rhythm étude that exercises the notation lens's tuplet / grace-note /
// sub-sixteenth engraving. A near-legato 0.98 gate keeps distinct pitches
// articulated while leaving offsets essentially on-grid so the subdivision
// detector reads cleanly. Returns one track's worth of notes.
type Placed = { midi: number; beat: number; beats: number };

function placed(bpm: number, notes: Placed[]): StarterNote[] {
  const secPerBeat = 60 / bpm;
  return notes.map((n) => ({
    midi: n.midi,
    time: n.beat * secPerBeat,
    duration: n.beats * secPerBeat * 0.98,
  }));
}

// Realistic multi-track pieces live in sibling files (kept out of this barrel so
// their per-bar pitch tables stay readable and independently auditable).
import { buildBachPreludeTracks } from "./bach-prelude";
import { buildFurEliseTracks } from "./fur-elise";

// MIDI note numbers used by the rhythm étude below.
// C5=72 D5=74 E5=76 F5=77 G5=79 A5=81 B5=83 C6=84; A4=69 C#5=73
const A4 = 69, C5 = 72, Cs5 = 73, D5 = 74, E5 = 76;
const F5 = 77, G5 = 79, A5 = 81, B5 = 83, C6 = 84, G4 = 67;

// Rhythm étude — a short single-staff study that exercises the notation lens's
// richer rhythms: eighth-note triplets (bar 1), a thirty-second-note run (bar 2),
// grace notes — a lone acciaccatura and a two-note grace group (bar 3) — and the
// extended tuplet vocabulary (bar 4): a quarter-note triplet spanning two beats
// plus a one-beat quintuplet. Placed on absolute beats (via `placed`) so onsets
// land on the true 1/3, 1/5 and 1/32 positions and the graces overlap just
// before their principals.
const RHYTHM_ETUDE: Placed[] = [
  // Bar 1 (beats 0–4): two eighth-note triplet groups, then two quarters.
  { midi: C5, beat: 0, beats: 1 / 3 },
  { midi: D5, beat: 1 / 3, beats: 1 / 3 },
  { midi: E5, beat: 2 / 3, beats: 1 / 3 },
  { midi: F5, beat: 1, beats: 1 / 3 },
  { midi: E5, beat: 1 + 1 / 3, beats: 1 / 3 },
  { midi: D5, beat: 1 + 2 / 3, beats: 1 / 3 },
  { midi: C5, beat: 2, beats: 1 },
  { midi: G4, beat: 3, beats: 1 },
  // Bar 2 (beats 4–8): an ascending 32nd-note run, a quarter, then a half.
  { midi: C5, beat: 4, beats: 0.125 },
  { midi: D5, beat: 4.125, beats: 0.125 },
  { midi: E5, beat: 4.25, beats: 0.125 },
  { midi: F5, beat: 4.375, beats: 0.125 },
  { midi: G5, beat: 4.5, beats: 0.125 },
  { midi: A5, beat: 4.625, beats: 0.125 },
  { midi: B5, beat: 4.75, beats: 0.125 },
  { midi: C6, beat: 4.875, beats: 0.125 },
  { midi: G5, beat: 5, beats: 1 },
  { midi: E5, beat: 6, beats: 2 },
  // Bar 3 (beats 8–12): a quarter, a grace→quarter, a grace-pair→quarter, a quarter.
  // Graces sit hard against their principals (gap ≈ 0.05 beat) — a real ornament,
  // not a metric 32nd — so the grace detector binds them.
  { midi: A4, beat: 8, beats: 1 },
  { midi: Cs5, beat: 8.95, beats: 0.05 }, // acciaccatura before D5
  { midi: D5, beat: 9, beats: 1 },
  { midi: G5, beat: 9.9, beats: 0.05 }, // grace pair before E5
  { midi: A5, beat: 9.95, beats: 0.05 },
  { midi: E5, beat: 10, beats: 1 },
  { midi: C5, beat: 11, beats: 1 },
  // Bar 4 (beats 12–16): a quarter-note triplet over two beats (a MULTI-beat
  // tuplet — 3 notes in the span of a half note), then a one-beat quintuplet
  // (5 in the space of 4 sixteenths), then a closing quarter.
  { midi: C5, beat: 12, beats: 2 / 3 },
  { midi: E5, beat: 12 + 2 / 3, beats: 2 / 3 },
  { midi: G5, beat: 12 + 4 / 3, beats: 2 / 3 },
  { midi: C5, beat: 14, beats: 1 / 5 },
  { midi: D5, beat: 14 + 1 / 5, beats: 1 / 5 },
  { midi: E5, beat: 14 + 2 / 5, beats: 1 / 5 },
  { midi: F5, beat: 14 + 3 / 5, beats: 1 / 5 },
  { midi: G5, beat: 14 + 4 / 5, beats: 1 / 5 },
  { midi: C5, beat: 15, beats: 1 },
];

// Tempos chosen to sit in each piece's customary performance range.
const BACH_BPM = 69;
const ELISE_BPM = 68;

export const STARTERS: Starter[] = [
  {
    // J.S. Bach — Prelude in C major, BWV 846 (Well-Tempered Clavier, Book I).
    // Every bar is the same 16th-note broken-chord figuration over that bar's
    // harmony (see bach-prelude.ts): 32 measures of the canonical progression
    // plus a final tonic chord resolving the bar-32 dominant. Two hands →
    // grand staff. The showcase piece.
    id: "seed-bach-prelude-c-major",
    title: "Prelude in C major, BWV 846",
    composer: "J.S. Bach",
    bpm: BACH_BPM,
    timeSig: [4, 4],
    tracks: buildBachPreludeTracks(BACH_BPM),
  },
  {
    // Beethoven — Für Elise (WoO 59), the A-section theme. A minor, 3/8; the
    // iconic E–D#–E–D#–E motif over an arpeggiated left hand (see fur-elise.ts).
    id: "seed-fur-elise",
    title: "Für Elise",
    composer: "Beethoven",
    bpm: ELISE_BPM,
    timeSig: [3, 8],
    tracks: buildFurEliseTracks(ELISE_BPM),
  },
  {
    // Functional notation fixture (not a toy melody): tuplets, 32nds, grace notes.
    id: "seed-rhythm-etude",
    title: "Rhythm Étude",
    composer: "Sonata",
    bpm: 76,
    tracks: [{ name: "Étude", program: 0, notes: placed(76, RHYTHM_ETUDE) }],
  },
];
