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
import {
  bars,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type {
  RhythmHands,
  RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { effectiveOnsets } from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { findVoicing, type ChordEvent, type VoicingOptions } from "./voicing";

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
 * Resolve one rhythm pattern to absolute onset beats on the score's bar grid.
 *
 * The necklace repeats every bar: within each bar an effective onset `k` lands at
 * `barStart + span·k/subdivisions`, where `span` is that bar's length. Bars are
 * enumerated with `bars()` (time-signature aware, 4/4 by default — what the chord
 * grid emits), and the final bar's span runs to `scoreEndBeat`. We iterate bars
 * explicitly rather than via `subdivideBars(score, n)`, which collapses a
 * degenerate `span <= 0` bar to a single entry and would desynchronise the grid.
 * Because onsets are sorted and every in-bar beat is `< nextBarStart`, the
 * concatenation across bars is already sorted ascending.
 */
function resolvePattern(score: Score, pattern: RhythmPattern): number[] {
  const barList = bars(score);
  const end = scoreEndBeat(score);
  const onsets = effectiveOnsets(pattern);
  const beats: number[] = [];
  for (let i = 0; i < barList.length; i++) {
    const start = barList[i]!.startBeat;
    const next = i + 1 < barList.length ? barList[i + 1]!.startBeat : end;
    const span = next - start;
    if (span <= 0) continue; // skip a degenerate (zero/negative-length) bar
    for (const k of onsets) {
      beats.push(start + (span * k) / pattern.subdivisions);
    }
  }
  return beats;
}

/**
 * Regenerate chord notes from a score's authored chord annotations under `cfg`,
 * returning a new `Score`. All other tracks, notes, and annotations are kept
 * intact; only notes on {@link CHORD_TRACK} are replaced, and a `TrackMeta` for
 * it is ensured. When the score has no authored chord annotations the input is
 * returned unchanged.
 *
 * When `hands` is nullish the emitted notes are byte-for-byte today's (no
 * `rhythm` reaches the strategy). When present, each hand's pattern is resolved
 * to absolute onset beats on the bar grid and passed through `opts.rhythm`, so
 * the strategy strikes a bar-anchored groove instead of one block note per chord.
 */
export function reVoiceChords(
  score: Score,
  cfg: { realistic: boolean; strategyId: string; octave: number },
  hands?: RhythmHands | null,
): Score {
  const events: ChordEvent[] = score.annotations
    .filter(isAuthoredChord)
    .map((a) => ({ data: a.data, start: a.start, end: a.end }))
    .sort((x, y) => x.start - y.start);

  if (events.length === 0) return score;

  const opts: VoicingOptions = {
    octave: cfg.octave,
    voiceLead: cfg.realistic,
    track: CHORD_TRACK,
    idPrefix: CHORD_NOTE_PREFIX,
  };
  if (hands) {
    opts.rhythm = {
      bass: resolvePattern(score, hands.bass),
      chord: resolvePattern(score, hands.chord),
    };
  }

  const chordNotes = findVoicing(cfg.strategyId).voice(events, opts);

  const notes = [
    ...score.notes.filter((n) => n.track !== CHORD_TRACK),
    ...chordNotes,
  ];

  const tracks = score.tracks.some((t) => t.id === CHORD_TRACK)
    ? score.tracks
    : [...score.tracks, { id: CHORD_TRACK, name: "Chords" }];

  return { ...score, tracks, notes };
}
