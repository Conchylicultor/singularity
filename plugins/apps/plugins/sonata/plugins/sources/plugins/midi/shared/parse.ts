/**
 * Parse a MIDI ArrayBuffer into a Sonata `Score`, plus derive the song metadata
 * the library stores alongside it.
 *
 * Beats are always **quarter-note beats**: `beat = ticks / ppq`.
 * Velocity is kept on the 0–127 integer scale (MIDI native); `@tonejs/midi`
 * already normalises its `note.velocity` to 0–1 floats, so we multiply by 127
 * and round to restore the canonical MIDI range that `Note.velocity` documents.
 *
 * Lives in `shared/` (plugin-private) so both the web import button and the
 * plugin's own server import path call one isomorphic source of truth.
 * `@tonejs/midi` is Node/Bun-safe.
 */

import { Midi } from "@tonejs/midi";
import {
  beatToSeconds,
  scoreEndBeat,
  type Annotation,
  type KeySignature,
  type Note,
  type Score,
  type TempoEvent,
  type TimeSigEvent,
  type TrackMeta,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Accepts an `ArrayBuffer` (web) or a `Uint8Array` (server `Bun.file().bytes()`). */
function toArrayBuffer(raw: unknown): ArrayBuffer {
  if (raw instanceof ArrayBuffer) return raw;
  if (raw instanceof Uint8Array) {
    // `@tonejs/midi` reads from an ArrayBuffer; hand it a tight copy so a
    // pooled/oversized backing buffer never leaks extra bytes into the parser.
    return raw.buffer.slice(
      raw.byteOffset,
      raw.byteOffset + raw.byteLength,
    ) as ArrayBuffer;
  }
  throw new Error(
    `[midi source] parseMidi() expected an ArrayBuffer or Uint8Array, got ${typeof raw}`,
  );
}

export function parseMidi(raw: unknown): Score {
  const buf = toArrayBuffer(raw);

  // @tonejs/midi throws on malformed input — we propagate loudly (no swallow).
  const midi = new Midi(buf);
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
      // GM program number (0-127) drives per-track instrument auto-mapping in
      // the audio layer. Percussion tracks (channel 10) carry a program too but
      // are out of scope for melodic timbres — they fall back to the default.
      ...(typeof track.instrument.number === "number"
        ? { gmProgram: track.instrument.number }
        : {}),
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

  // --- Key signature(s) ------------------------------------------------
  // @tonejs/midi exposes header.keySignatures as { ticks, key, scale }[] where
  // `key` is a note name ("Eb", "F#") and `scale` is "major" | "minor". A file
  // may declare SEVERAL — a piece that modulates carries one event per change
  // (e.g. Chopin's Op.48 No.1: Eb major → C major → Eb major). We surface all of
  // them: the opening event as `meta.key` (the starting key every consumer reads,
  // incl. the keyboard's note spelling), and every event as an authored `key`
  // annotation so the progress-bar key regions and the current-key chip track the
  // modulations exactly as the file authored them — instead of collapsing to the
  // first key the way taking `keySignatures[0]` alone did. Files commonly repeat
  // the same event across tracks, so we dedupe by (beat, tonic, mode). With keys
  // authored here, `inferKeys` defers to them rather than guessing.
  const keyEvents: { beat: number; key: KeySignature }[] = [];
  const seenKey = new Set<string>();
  for (const k of midi.header.keySignatures) {
    if (!k.key) continue;
    const beat = k.ticks / ppq;
    const key: KeySignature = {
      tonic: k.key,
      mode: k.scale === "minor" ? "minor" : "major",
    };
    const id = `${beat}:${key.tonic}:${key.mode}`;
    if (seenKey.has(id)) continue;
    seenKey.add(id);
    keyEvents.push({ beat, key });
  }
  keyEvents.sort((a, b) => a.beat - b.beat);

  // Each authored key governs `[beat, nextBeat)`; the last runs to the score end.
  // The span is presentational only (the `effectiveKeyAt` resolver keys off the
  // start beat), but we set it meaningfully to match the derived-key convention.
  const scoreEnd = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  const keyAnnotations: Annotation[] = keyEvents.map((e, i) => ({
    type: "key",
    start: e.beat,
    end: i + 1 < keyEvents.length ? keyEvents[i + 1]!.beat : scoreEnd,
    data: e.key,
    source: "authored",
  }));

  return {
    meta: {
      ...(midi.header.name ? { title: midi.header.name } : {}),
      ...(keyEvents[0] ? { key: keyEvents[0].key } : {}),
    },
    tracks,
    tempoMap,
    timeSigMap,
    notes,
    annotations: keyAnnotations,
  };
}

export interface MidiSongMeta {
  title: string;
  durationSec: number;
  endBeat: number;
  trackCount: number;
}

/**
 * Derive the library song metadata from a MIDI file's bytes and its filename.
 * The single source of truth shared by the web import button and the server
 * import path — title comes from the filename (sans `.mid`/`.midi`), the rest
 * from the parsed `Score`.
 */
export function deriveMidiSongMeta(
  raw: unknown,
  filename: string,
): MidiSongMeta {
  const score = parseMidi(raw);
  const endBeat = scoreEndBeat(score);
  return {
    title: filename.replace(/\.midi?$/i, ""),
    durationSec: beatToSeconds(score, endBeat),
    endBeat,
    trackCount: score.tracks.length,
  };
}
