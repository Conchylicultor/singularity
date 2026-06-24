/**
 * Compile chord-grid raw input → `Score`.
 *
 * The grid text is the **authored truth**, written in the chord-grid
 * mini-language (see `parse-grid.ts`): whitespace/newline-separated cells, each
 * one bar; a group `( … )` shares a bar between several chords; a hold `.`
 * sustains the previous chord. Each chord becomes a `source:"authored"` chord
 * annotation; the chord *notes* are not produced here — the shell's reactive
 * re-voicing step regenerates them from these annotations under the global
 * voicing config, so this source emits annotations only.
 *
 * The grid declares **no tempo / time-signature opinion** (empty maps): it has
 * no authored tempo, so when merged with a source that does (e.g. MIDI),
 * `mergeScores`' first-non-empty rule lets that source own the timeline. Alone,
 * the `score/core` helpers fall back to 120 bpm / 4-4 — the same musical result,
 * with no placeholder fighting a real tempo. The bar length used to lay chords
 * out is the local 4/4 assumption baked into the annotation beats.
 */

import type {
  Annotation,
  ChordData,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { parseGrid } from "./parse-grid";

/** Raw input shape produced by `ChordGridLoader`. */
export interface ChordGridRaw {
  text: string;
}

function isChordGridRaw(raw: unknown): raw is ChordGridRaw {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as ChordGridRaw).text === "string"
  );
}

/** Default chord-grid raw (empty grid). */
export const EMPTY_CHORD_GRID_RAW: ChordGridRaw = {
  text: "",
};

/**
 * Normalize any persisted/hydrated value into a well-formed `ChordGridRaw`.
 * Shared by the loader and the editor section so both read raw identically.
 */
export function asChordGridRaw(raw: unknown): ChordGridRaw {
  if (isChordGridRaw(raw)) {
    return { text: raw.text };
  }
  return EMPTY_CHORD_GRID_RAW;
}

export function compile(raw: unknown): Score {
  if (!isChordGridRaw(raw)) {
    throw new Error(
      `[chord-grid source] compile() expected { text }, got ${typeof raw}`,
    );
  }

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

  return {
    meta: {},
    // No tracks / notes — the shell's re-voicing step owns chord-note
    // generation from these `source:"authored"` chord annotations.
    tracks: [],
    // No authored tempo / time-sig — defer to a merged source that has one.
    tempoMap: [],
    timeSigMap: [],
    notes: [],
    annotations,
  };
}
