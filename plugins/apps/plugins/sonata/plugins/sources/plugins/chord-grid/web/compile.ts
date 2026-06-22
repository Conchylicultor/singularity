/**
 * Compile chord-grid raw input → `Score`.
 *
 * The grid text is the **authored truth**, written in the chord-grid
 * mini-language (see `parse-grid.ts`): whitespace/newline-separated cells, each
 * one bar; a group `( … )` shares a bar between several chords; a hold `.`
 * sustains the previous chord. Each chord becomes a `source:"authored"` chord
 * annotation, and the selected voicing strategy *derives* the notes — the
 * opposite direction of the MIDI source.
 *
 * The grid declares **no tempo / time-signature opinion** (empty maps): it has
 * no authored tempo, so when merged with a source that does (e.g. MIDI),
 * `mergeScores`' first-non-empty rule lets that source own the timeline. Alone,
 * the `score/core` helpers fall back to 120 bpm / 4-4 — the same musical result,
 * with no placeholder fighting a real tempo. The bar length used to lay chords
 * out is the local 4/4 assumption baked into the note/annotation beats.
 */

import type {
  Annotation,
  ChordData,
  Note,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  DEFAULT_VOICING_ID,
  findVoicing,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { parseGrid } from "./parse-grid";
import { CHORD_GRID_NOTE_PREFIX, CHORD_GRID_TRACK } from "./constants";

/** Raw input shape produced by `ChordGridLoader`. */
export interface ChordGridRaw {
  text: string;
  voicingId: string;
  octave: number;
}

function isChordGridRaw(raw: unknown): raw is ChordGridRaw {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as ChordGridRaw).text === "string"
  );
}

/** Default chord-grid raw (empty grid, default voicing, middle-C octave). */
export const EMPTY_CHORD_GRID_RAW: ChordGridRaw = {
  text: "",
  voicingId: DEFAULT_VOICING_ID,
  octave: 4,
};

/**
 * Normalize any persisted/hydrated value into a well-formed `ChordGridRaw`,
 * filling defaults for a missing voicing/octave. Shared by the loader and the
 * editor section so both read raw identically.
 */
export function asChordGridRaw(raw: unknown): ChordGridRaw {
  if (isChordGridRaw(raw)) {
    return {
      text: raw.text,
      voicingId: raw.voicingId || DEFAULT_VOICING_ID,
      octave: raw.octave ?? 4,
    };
  }
  return EMPTY_CHORD_GRID_RAW;
}

export function compile(raw: unknown): Score {
  if (!isChordGridRaw(raw)) {
    throw new Error(
      `[chord-grid source] compile() expected { text, voicingId, octave }, got ${typeof raw}`,
    );
  }

  const voicingId = raw.voicingId || DEFAULT_VOICING_ID;
  const octave = raw.octave ?? 4;

  const { events } = parseGrid(raw.text);

  const annotations: Annotation[] = events.map(
    (ev) =>
      ({
        type: "chord",
        start: ev.start,
        end: ev.end,
        data: ev.data,
        source: "authored",
      }) satisfies Annotation<"chord", ChordData>,
  );

  const notes: Note[] = findVoicing(voicingId).voice(events, {
    octave,
    track: CHORD_GRID_TRACK,
    idPrefix: CHORD_GRID_NOTE_PREFIX,
  });

  return {
    meta: {},
    tracks: [{ id: CHORD_GRID_TRACK, name: "Chord Grid" }],
    // No authored tempo / time-sig — defer to a merged source that has one.
    tempoMap: [],
    timeSigMap: [],
    notes,
    annotations,
  };
}
