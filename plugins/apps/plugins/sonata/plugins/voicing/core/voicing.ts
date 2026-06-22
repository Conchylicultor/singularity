/**
 * Voicing strategies: timed chord events → performed notes.
 *
 * The "chord → notes" direction of Sonata's two-layer model. A chord-authoring
 * source authors chord *annotations* (root + quality, timed in quarter-note
 * beats) and a voicing strategy *derives* the literal `Note[]` a player can sound
 * and draw — the opposite of the MIDI source, which carries notes directly.
 *
 * This is a shared leaf: any source (chord-grid, Ultimate Guitar, …) feeds its
 * `ChordEvent[]` here and picks a strategy, so chord voicing has exactly one
 * home. The caller owns its own track id and note-id namespace via
 * `VoicingOptions`, so two sources never collide on track or note id. Pitch math
 * is delegated to `theory`'s `chordPitches`; this leaf only decides which tones
 * sound and when.
 */

import type {
  ChordData,
  Note,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { chordPitches } from "@plugins/apps/plugins/sonata/plugins/theory/core";

/** A parsed, timed chord (quarter-note beats) — the input to every voicing. */
export interface ChordEvent {
  data: ChordData;
  start: number;
  end: number;
}

export interface VoicingOptions {
  /** Octave for the chord root. C4 = middle C = MIDI 60. */
  octave: number;
  /** -> TrackMeta.id the derived notes belong to (the caller owns its track). */
  track: string;
  /**
   * Note-id namespace, e.g. `"cg"` or `"ug"`. Ids are `${idPrefix}-${i}-${k}`;
   * each source picks its own prefix so derived notes never collide on id.
   */
  idPrefix: string;
  /** MIDI velocity for struck notes (default 80). */
  velocity?: number;
}

export interface Voicing {
  id: string;
  label: string;
  voice: (events: ChordEvent[], opts: VoicingOptions) => Note[];
}

const DEFAULT_VELOCITY = 80;

export const VOICINGS: Voicing[] = [
  {
    id: "block-triad",
    label: "Block triad",
    voice: (events, { octave, track, idPrefix, velocity = DEFAULT_VELOCITY }) =>
      events.flatMap((ev, i) =>
        // Triad only: root + 3rd + 5th; drops any 7th / extensions.
        chordPitches(ev.data, octave)
          .slice(0, 3)
          .map((pitch, k) => ({
            id: `${idPrefix}-${i}-${k}`,
            pitch,
            start: ev.start,
            duration: ev.end - ev.start,
            velocity,
            track,
          })),
      ),
  },
  {
    id: "block-full",
    label: "Block (full chord)",
    voice: (events, { octave, track, idPrefix, velocity = DEFAULT_VELOCITY }) =>
      events.flatMap((ev, i) =>
        chordPitches(ev.data, octave).map((pitch, k) => ({
          id: `${idPrefix}-${i}-${k}`,
          pitch,
          start: ev.start,
          duration: ev.end - ev.start,
          velocity,
          track,
        })),
      ),
  },
  {
    id: "arpeggio-up",
    label: "Arpeggio (up)",
    voice: (events, { octave, track, idPrefix, velocity = DEFAULT_VELOCITY }) =>
      events.flatMap((ev, i) => {
        const tones = chordPitches(ev.data, octave);
        const step = (ev.end - ev.start) / tones.length;
        return tones.map((pitch, k) => ({
          id: `${idPrefix}-${i}-${k}`,
          pitch,
          start: ev.start + step * k,
          duration: step,
          velocity,
          track,
        }));
      }),
  },
];

export const DEFAULT_VOICING_ID = VOICINGS[0]!.id;

/** Look up a voicing by id; throws loudly on an unknown id. */
export function findVoicing(id: string): Voicing {
  const v = VOICINGS.find((x) => x.id === id);
  if (!v) throw new Error(`[voicing] unknown voicing: ${id}`);
  return v;
}
