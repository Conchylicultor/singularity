/**
 * Voicing strategies: chord events → notes.
 *
 * This is the "opposite direction" of the MIDI source — the chord grid authors
 * chord *annotations* and these strategies *derive* the literal notes.
 *
 * Today this is a plain in-source registry, selected by id in the loader and
 * applied in the pure `compile`. The `Voicing` / `ChordEvent` shapes are the
 * stable contract: when cross-plugin voicing is wanted, this registry can be
 * promoted to a `ChordGrid.Voicing` slot *scoped to this plugin* without
 * changing those types.
 */

import type {
  ChordData,
  Note,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { qualityToIntervals } from "@plugins/apps/plugins/sonata/plugins/theory/core";

/** A parsed, timed chord from the grid (quarter-note beats). */
export interface ChordEvent {
  data: ChordData;
  start: number;
  end: number;
}

export interface VoicingOptions {
  /** Octave for the chord root. C4 = middle C = MIDI 60. */
  octave: number;
}

export interface Voicing {
  id: string;
  label: string;
  voice: (events: ChordEvent[], opts: VoicingOptions) => Note[];
}

const VELOCITY = 80;
const TRACK = "cg0";

/** MIDI number of the chord root in the requested octave. */
function rootMidi(ev: ChordEvent, octave: number): number {
  return 12 * (octave + 1) + ev.data.root;
}

/** All chord tones (root + intervals) as MIDI numbers, low → high. */
function chordTones(ev: ChordEvent, octave: number): number[] {
  const base = rootMidi(ev, octave);
  return [base, ...qualityToIntervals(ev.data.quality).map((i) => base + i)];
}

/** Stable id: encodes the event index and the chord-tone index. */
function noteId(eventIndex: number, toneIndex: number): string {
  return `cg-${eventIndex}-${toneIndex}`;
}

export const VOICINGS: Voicing[] = [
  {
    id: "block-triad",
    label: "Block triad",
    voice: (events, { octave }) =>
      events.flatMap((ev, i) => {
        const base = rootMidi(ev, octave);
        // Triad only: root + first two intervals (3rd, 5th); drops any 7th.
        const triad = [0, ...qualityToIntervals(ev.data.quality).slice(0, 2)];
        return triad.map((interval, k) => ({
          id: noteId(i, k),
          pitch: base + interval,
          start: ev.start,
          duration: ev.end - ev.start,
          velocity: VELOCITY,
          track: TRACK,
        }));
      }),
  },
  {
    id: "block-full",
    label: "Block (full chord)",
    voice: (events, { octave }) =>
      events.flatMap((ev, i) =>
        chordTones(ev, octave).map((pitch, k) => ({
          id: noteId(i, k),
          pitch,
          start: ev.start,
          duration: ev.end - ev.start,
          velocity: VELOCITY,
          track: TRACK,
        })),
      ),
  },
  {
    id: "arpeggio-up",
    label: "Arpeggio (up)",
    voice: (events, { octave }) =>
      events.flatMap((ev, i) => {
        const tones = chordTones(ev, octave);
        const span = ev.end - ev.start;
        const step = span / tones.length;
        return tones.map((pitch, k) => ({
          id: noteId(i, k),
          pitch,
          start: ev.start + step * k,
          duration: step,
          velocity: VELOCITY,
          track: TRACK,
        }));
      }),
  },
];

export const CHORD_GRID_TRACK = TRACK;
export const DEFAULT_VOICING_ID = VOICINGS[0]!.id;

/** Look up a voicing by id; throws loudly on an unknown id. */
export function findVoicing(id: string): Voicing {
  const v = VOICINGS.find((x) => x.id === id);
  if (!v) throw new Error(`[chord-grid] unknown voicing: ${id}`);
  return v;
}
