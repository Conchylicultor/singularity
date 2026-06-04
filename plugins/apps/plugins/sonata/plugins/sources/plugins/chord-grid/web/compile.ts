/**
 * Compile chord-grid raw input → `Score`.
 *
 * The grid text is the **authored truth**: bars are separated by `|`, chords
 * within a bar are whitespace-separated and split the bar equally. Each chord
 * becomes a `source:"authored"` chord annotation, and the selected voicing
 * strategy *derives* the notes — the opposite direction of the MIDI source.
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
import { parseChordSymbol } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import {
  CHORD_GRID_TRACK,
  DEFAULT_VOICING_ID,
  findVoicing,
  type ChordEvent,
} from "./voicings";

/** Raw input shape produced by `ChordGridLoader`. */
export interface ChordGridRaw {
  text: string;
  voicingId: string;
  octave: number;
}

/** Default bar length in quarter-note beats (4/4). */
const BEATS_PER_BAR = 4;

function isChordGridRaw(raw: unknown): raw is ChordGridRaw {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as ChordGridRaw).text === "string"
  );
}

/** Parse the grid text into timed chord events; unparseable tokens are skipped. */
export function parseGrid(text: string): {
  events: ChordEvent[];
  skipped: string[];
} {
  const bars = text
    .split("|")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const events: ChordEvent[] = [];
  const skipped: string[] = [];
  let beat = 0;

  for (const bar of bars) {
    const tokens = bar.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      beat += BEATS_PER_BAR;
      continue;
    }
    const slot = BEATS_PER_BAR / tokens.length;
    tokens.forEach((tok, i) => {
      const data = parseChordSymbol(tok);
      const start = beat + slot * i;
      const end = start + slot;
      if (data) {
        events.push({ data, start, end });
      } else {
        skipped.push(tok);
      }
    });
    beat += BEATS_PER_BAR;
  }

  return { events, skipped };
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

  const notes: Note[] = findVoicing(voicingId).voice(events, { octave });

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
