/**
 * Compile a MIDI ArrayBuffer into a Sonata `Score`.
 *
 * Beats are always **quarter-note beats**: `beat = ticks / ppq`.
 * Velocity is kept on the 0–127 integer scale (MIDI native); `@tonejs/midi`
 * already normalises its `note.velocity` to 0–1 floats, so we multiply by 127
 * and round to restore the canonical MIDI range that `Note.velocity` documents.
 */

import { Midi } from "@tonejs/midi";
import type {
  Note,
  Score,
  TempoEvent,
  TimeSigEvent,
  TrackMeta,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

export function compile(raw: unknown): Score {
  if (!(raw instanceof ArrayBuffer)) {
    throw new Error(
      `[midi source] compile() expected an ArrayBuffer, got ${typeof raw}`,
    );
  }

  // @tonejs/midi throws on malformed input — we propagate loudly (no swallow).
  const midi = new Midi(raw);
  const ppq = midi.header.ppq;

  // --- Tempo map -------------------------------------------------------
  // @tonejs/midi exposes header.tempos as { ticks, bpm }[].
  let tempoMap: TempoEvent[] = midi.header.tempos.map((t) => ({
    beat: t.ticks / ppq,
    bpm: t.bpm,
  }));
  tempoMap.sort((a, b) => a.beat - b.beat);
  if (tempoMap.length === 0) {
    tempoMap = [{ beat: 0, bpm: 120 }];
  }

  // --- Time-signature map ----------------------------------------------
  // @tonejs/midi exposes header.timeSignatures as { ticks, timeSignature: [n,d] }[].
  // `timeSignature` is typed as a bare number[]; default any missing component
  // to 4/4 rather than emit an undefined into the typed TimeSigEvent.
  let timeSigMap: TimeSigEvent[] = midi.header.timeSignatures.map((ts) => ({
    beat: ts.ticks / ppq,
    numerator: ts.timeSignature[0] ?? 4,
    denominator: ts.timeSignature[1] ?? 4,
  }));
  timeSigMap.sort((a, b) => a.beat - b.beat);
  if (timeSigMap.length === 0) {
    timeSigMap = [{ beat: 0, numerator: 4, denominator: 4 }];
  }

  // --- Tracks and notes ------------------------------------------------
  // Only include MIDI tracks that contain at least one note.
  const tracks: TrackMeta[] = [];
  const notes: Note[] = [];

  for (let trackIdx = 0; trackIdx < midi.tracks.length; trackIdx++) {
    const track = midi.tracks[trackIdx]!;
    if (track.notes.length === 0) continue;

    const trackId = `t${trackIdx}`;
    const trackMeta: TrackMeta = {
      id: trackId,
      ...(track.name ? { name: track.name } : {}),
      ...(track.instrument.name ? { instrumentHint: track.instrument.name } : {}),
    };
    tracks.push(trackMeta);

    for (let noteIdx = 0; noteIdx < track.notes.length; noteIdx++) {
      const n = track.notes[noteIdx]!;
      notes.push({
        // Stable identity: track index + note index within that track.
        id: `t${trackIdx}-n${noteIdx}`,
        pitch: n.midi,
        start: n.ticks / ppq,
        duration: n.durationTicks / ppq,
        // @tonejs/midi normalises velocity to [0, 1]. Scale back to [0, 127].
        velocity: Math.round(n.velocity * 127),
        track: trackId,
      });
    }
  }

  return {
    meta: {
      ...(midi.header.name ? { title: midi.header.name } : {}),
    },
    tracks,
    tempoMap,
    timeSigMap,
    notes,
    annotations: [],
  };
}
