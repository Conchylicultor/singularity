/**
 * The single chord-note generation chokepoint.
 *
 * Symbol-based sources (chord-grid, Ultimate Guitar, …) emit chord
 * *annotations* only; this step regenerates the chord *notes* from those
 * annotations under the global voicing config. Run reactively in the shell
 * (before key inference, so chord notes exist for detection), it makes
 * voice-leading an orthogonal modifier applied uniformly to every symbol source
 * — zero per-source code.
 *
 * Pure and framework-free: a new `Score` in, a new `Score` out; the input is
 * never mutated.
 */

import type {
  Annotation,
  ChordAnnotation,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { findVoicing, type ChordEvent } from "./voicing";

/**
 * The single synthesized track that re-voiced chord notes live on. Distinct from
 * any source's own track id (e.g. chord-grid's `cg0`), since this chokepoint —
 * not the source — now owns chord notes.
 */
export const CHORD_TRACK = "chords";

/** Note-id namespace for re-voiced chord notes (see VoicingOptions.idPrefix). */
const CHORD_NOTE_PREFIX = "chord";

function isAuthoredChord(a: Annotation): a is ChordAnnotation {
  return a.type === "chord" && a.source === "authored";
}

/**
 * Regenerate chord notes from a score's authored chord annotations under `cfg`,
 * returning a new `Score`. All other tracks, notes, and annotations are kept
 * intact; only notes on {@link CHORD_TRACK} are replaced, and a `TrackMeta` for
 * it is ensured. When the score has no authored chord annotations the input is
 * returned unchanged.
 */
export function reVoiceChords(
  score: Score,
  cfg: { realistic: boolean; strategyId: string; octave: number },
): Score {
  const events: ChordEvent[] = score.annotations
    .filter(isAuthoredChord)
    .map((a) => ({ data: a.data, start: a.start, end: a.end }))
    .sort((x, y) => x.start - y.start);

  if (events.length === 0) return score;

  const chordNotes = findVoicing(cfg.strategyId).voice(events, {
    octave: cfg.octave,
    voiceLead: cfg.realistic,
    track: CHORD_TRACK,
    idPrefix: CHORD_NOTE_PREFIX,
  });

  const notes = [
    ...score.notes.filter((n) => n.track !== CHORD_TRACK),
    ...chordNotes,
  ];

  const tracks = score.tracks.some((t) => t.id === CHORD_TRACK)
    ? score.tracks
    : [...score.tracks, { id: CHORD_TRACK, name: "Chords" }];

  return { ...score, tracks, notes };
}
