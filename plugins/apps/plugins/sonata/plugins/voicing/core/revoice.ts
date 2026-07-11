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
import { voiceChords, type ChordEvent, type VoicingOptions } from "./voicing";
import { findFiguration } from "./figuration";

/**
 * The synthesized track the re-voiced chord (upper-structure) notes live on.
 * Distinct from any source's own track id (e.g. chord-grid's `cg0`), since this
 * chokepoint — not the source — now owns chord notes. The bass root lives on its
 * own {@link CHORD_BASS_TRACK}, so the two can be muted / hidden / instrumented
 * independently through the generic track-mixer.
 */
export const CHORD_TRACK = "chords";

/**
 * The synthesized track the re-voiced bass root lives on — split out from
 * {@link CHORD_TRACK} so bass and chords are independently controllable in the
 * mixer. Bass notes only exist when a voicing wants them (voice-leading on, or a
 * rhythm hand active); with neither, this track carries no notes.
 */
export const CHORD_BASS_TRACK = "chords-bass";

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
 * intact; only notes on {@link CHORD_TRACK} / {@link CHORD_BASS_TRACK} are
 * replaced, and a `TrackMeta` for each is ensured. When the score has no
 * authored chord annotations the input is returned unchanged.
 *
 * When `groove` is nullish the emitted notes are byte-for-byte today's block
 * chords (no `rhythm`/`figuration` reaches the engine). When present, each hand's
 * pattern is resolved to absolute onset beats on the bar grid (`opts.rhythm`) and
 * its figuration id resolved to a {@link Figuration} (`opts.figuration`), so each
 * hand strikes its own bar-anchored, tone-ordered groove instead of one block
 * note per chord.
 */
export function reVoiceChords(
  score: Score,
  cfg: { realistic: boolean; octave: number },
  groove?: {
    hands: RhythmHands;
    bassFigurationId: string;
    chordFigurationId: string;
  } | null,
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
    bassTrack: CHORD_BASS_TRACK,
    idPrefix: CHORD_NOTE_PREFIX,
  };
  if (groove) {
    opts.rhythm = {
      bass: resolvePattern(score, groove.hands.bass),
      chord: resolvePattern(score, groove.hands.chord),
    };
    opts.figuration = {
      bass: findFiguration(groove.bassFigurationId),
      chord: findFiguration(groove.chordFigurationId),
    };
  }

  const chordNotes = voiceChords(events, opts);

  const notes = [
    ...score.notes.filter(
      (n) => n.track !== CHORD_TRACK && n.track !== CHORD_BASS_TRACK,
    ),
    ...chordNotes,
  ];

  // Ensure a TrackMeta for both synthesized tracks, preserving any existing
  // metadata and the original track order (new entries appended).
  const byId = new Map(score.tracks.map((t) => [t.id, t]));
  if (!byId.has(CHORD_TRACK)) byId.set(CHORD_TRACK, { id: CHORD_TRACK, name: "Chords" });
  if (!byId.has(CHORD_BASS_TRACK)) byId.set(CHORD_BASS_TRACK, { id: CHORD_BASS_TRACK, name: "Bass" });
  const tracks = [...byId.values()];

  return { ...score, tracks, notes };
}
