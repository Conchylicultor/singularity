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

// MIDI note numbers used below: C4=60 D4=62 E4=64 F4=65 G4=67 A4=69
// A4=69 B4=71 C5=72 D5=74 D#5=75 E5=76
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;
const B4 = 71, C5 = 72, D5 = 74, Ds5 = 75, E5 = 76;

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
];
