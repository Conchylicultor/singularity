/**
 * Bundled starter songs, defined as note arrays of public-domain melodies. The
 * boot seed (`seed.ts`) turns each into a real MIDI attachment via `@tonejs/midi`
 * — no binary blobs in the repo, no licensing concerns.
 *
 * `time` and `duration` are in **seconds**; the seed sets the track tempo to
 * `bpm` (which only affects the MIDI's beat↔seconds header, not these absolute
 * seconds). `midi` is the MIDI note number (C4 = 60).
 */

export interface StarterNote {
  midi: number;
  time: number;
  duration: number;
}

export interface Starter {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  notes: StarterNote[];
}

// --- Small note-sequencing helper ------------------------------------------
// Build a sequence from [pitch, beats] pairs at a given bpm, laying notes
// back-to-back. A short gap (90% gate) keeps repeated pitches articulated.
type Step = [midi: number, beats: number];

function sequence(bpm: number, steps: Step[]): StarterNote[] {
  const secPerBeat = 60 / bpm;
  const notes: StarterNote[] = [];
  let time = 0;
  for (const [midi, beats] of steps) {
    const span = beats * secPerBeat;
    notes.push({ midi, time, duration: span * 0.9 });
    time += span;
  }
  return notes;
}

// --- Absolute-placement helper ---------------------------------------------
// Unlike `sequence` (which lays notes back-to-back), `placed` positions each
// note at an explicit quarter-note `beat`, so notes may sit off the binary grid
// (triplets, 32nds) and overlap (a grace note just before its principal). Used
// by the rhythm étude that exercises the notation lens's tuplet / grace-note /
// sub-sixteenth engraving. A near-legato 0.98 gate keeps distinct pitches
// articulated while leaving offsets essentially on-grid so the subdivision
// detector reads cleanly.
type Placed = { midi: number; beat: number; beats: number };

function placed(bpm: number, notes: Placed[]): StarterNote[] {
  const secPerBeat = 60 / bpm;
  return notes.map((n) => ({
    midi: n.midi,
    time: n.beat * secPerBeat,
    duration: n.beats * secPerBeat * 0.98,
  }));
}

// MIDI note numbers used below: C4=60 D4=62 E4=64 F4=65 G4=67 A4=69
// A4=69 B4=71 C5=72 D5=74 D#5=75 E5=76
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
const B4 = 71, C5 = 72, Cs5 = 73, D5 = 74, Ds5 = 75, E5 = 76;
const F5 = 77, G5 = 79, A5 = 81, B5 = 83, C6 = 84;

const ODE_TO_JOY: Step[] = [
  [E4, 1], [E4, 1], [F4, 1], [G4, 1],
  [G4, 1], [F4, 1], [E4, 1], [D4, 1],
  [C4, 1], [C4, 1], [D4, 1], [E4, 1],
  [E4, 1.5], [D4, 0.5], [D4, 2],
];

const TWINKLE: Step[] = [
  [C4, 1], [C4, 1], [G4, 1], [G4, 1],
  [A4, 1], [A4, 1], [G4, 2],
  [F4, 1], [F4, 1], [E4, 1], [E4, 1],
  [D4, 1], [D4, 1], [C4, 2],
];

// Für Elise opening: the iconic E–D#–E–D#–E–B–D–C–A motif (sixteenths into a
// quarter), then the answering C–E–A–B (eighths into a quarter).
const FUR_ELISE: Step[] = [
  [E5, 0.5], [Ds5, 0.5], [E5, 0.5], [Ds5, 0.5], [E5, 0.5], [B4, 0.5], [D5, 0.5], [C5, 0.5],
  [A4, 1.5],
  [C4, 0.5], [E4, 0.5], [A4, 0.5], [B4, 1.5],
];

// Rhythm étude — a short single-staff study that exercises the notation lens's
// richer rhythms: eighth-note triplets (bar 1), a thirty-second-note run (bar 2),
// and grace notes — a lone acciaccatura and a two-note grace group (bar 3).
// Placed on absolute beats (via `placed`) so onsets land on the true 1/3 and
// 1/32 positions and the grace notes overlap just before their principals.
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
];

export const STARTERS: Starter[] = [
  {
    id: "seed-ode-to-joy",
    title: "Ode to Joy",
    composer: "Beethoven",
    bpm: 100,
    notes: sequence(100, ODE_TO_JOY),
  },
  {
    id: "seed-twinkle",
    title: "Twinkle Twinkle",
    composer: "Trad.",
    bpm: 110,
    notes: sequence(110, TWINKLE),
  },
  {
    id: "seed-fur-elise",
    title: "Für Elise (opening)",
    composer: "Beethoven",
    bpm: 72,
    notes: sequence(72, FUR_ELISE),
  },
  {
    id: "seed-rhythm-etude",
    title: "Rhythm Étude",
    composer: "Sonata",
    bpm: 76,
    notes: placed(76, RHYTHM_ETUDE),
  },
];
