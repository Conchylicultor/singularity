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
import {
  chordPitches,
  nearestVoicing,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

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
   * -> TrackMeta.id the bass notes belong to, when the caller wants the bass on
   * a track separate from the upper structure (so it can be muted / hidden /
   * instrumented independently). Defaults to `track` when absent — bass and
   * chord tones then share one track, byte-for-byte with the original.
   */
  bassTrack?: string;
  /**
   * Note-id namespace, e.g. `"cg"` or `"ug"`. Ids are `${idPrefix}-${i}-${k}`;
   * each source picks its own prefix so derived notes never collide on id.
   */
  idPrefix: string;
  /** MIDI velocity for struck notes (default 80). */
  velocity?: number;
  /**
   * "Realistic" mode: voice-lead each chord to the nearest inversion of the
   * previous one (via `nearestVoicing`) and add a low bass root. When falsy
   * (the default) each chord plays in root position with no bass — the original
   * behaviour, byte-for-byte (same note ids/shape, no `voice` set).
   */
  voiceLead?: boolean;
  /**
   * Absolute onset beats per hand, sorted ascending. Resolved by reVoiceChords
   * from the bar grid — this module never learns about bars or time signatures.
   * When present, chords are struck on this bar-anchored necklace (a note per
   * onset in the chord in force) instead of one block note per chord event; when
   * absent every strategy emits exactly today's notes.
   */
  rhythm?: { bass: readonly number[]; chord: readonly number[] };
}

/**
 * A bass note is emitted when the voicing is voice-led OR a rhythm is active —
 * a left-hand groove with no bass note would be inert. Decoupling bass from
 * `voiceLead` makes that impossible.
 */
const wantsBass = (o: VoicingOptions) => !!o.voiceLead || !!o.rhythm;

export interface Voicing {
  id: string;
  label: string;
  voice: (events: ChordEvent[], opts: VoicingOptions) => Note[];
}

const DEFAULT_VELOCITY = 80;

/** Octave the bass root sits in — roughly 1–2 octaves below the voiced chord. */
const BASS_OCTAVE = 2;

/**
 * Place a bass pitch-class in the low register: the given pitch-class at
 * `BASS_OCTAVE` (C2 = MIDI 36). Carries the chord root (or the slash-chord bass
 * when present) under the voiced upper structure.
 */
function lowBassPitch(pc: number): number {
  return 12 * (BASS_OCTAVE + 1) + (((pc % 12) + 12) % 12);
}

/** One placed chord: the voiced upper structure plus an optional bass root. */
interface PlacedVoicing {
  pitches: number[];
  bass: number | null;
}

/**
 * Shared placement loop for every strategy. For each event it computes the
 * root-position tone set via `tonesOf`, then either voice-leads it to the
 * previous chord with a bass root (`voiceLead` on) or leaves it in root position
 * with no bass (off). Strategies own the *rhythm* over `pitches`; this owns the
 * *pitch placement*, so voice-leading is one orthogonal modifier shared by all.
 */
function placeVoicings(
  events: ChordEvent[],
  opts: VoicingOptions,
  tonesOf: (ev: ChordEvent) => number[],
): PlacedVoicing[] {
  let prevVoiced: number[] | null = null;
  return events.map((ev) => {
    const tones = tonesOf(ev);
    // Voice-leading advances `prevVoiced`; root position leaves it untouched so
    // it stays byte-for-byte with the original behaviour. Bass placement is
    // orthogonal: emitted whenever voice-leading OR a rhythm wants it.
    const pitches = opts.voiceLead ? nearestVoicing(tones, prevVoiced) : tones;
    if (opts.voiceLead) prevVoiced = pitches;
    const bass = wantsBass(opts)
      ? lowBassPitch(ev.data.bass ?? ev.data.root)
      : null;
    return { pitches, bass };
  });
}

/**
 * Emit the bass note for a placed chord, or `[]` when there is none. The bass is
 * a block note spanning the full chord duration on `bassTrack` (falling back to
 * `track`), `voice: 0`, with a `-b`-suffixed id so it never collides with the
 * upper-structure notes.
 */
function bassNote(
  ev: ChordEvent,
  placed: PlacedVoicing,
  i: number,
  { track, bassTrack, idPrefix, velocity = DEFAULT_VELOCITY }: VoicingOptions,
): Note[] {
  if (placed.bass === null) return [];
  return [
    {
      id: `${idPrefix}-${i}-b`,
      pitch: placed.bass,
      start: ev.start,
      duration: ev.end - ev.start,
      velocity,
      track: bassTrack ?? track,
      voice: 0,
    },
  ];
}

/**
 * Upper-structure voice for a note: `1` whenever a bass is present (voice-led or
 * rhythmic), so bass (`voice: 0`) and upper structure stay on distinct voices;
 * `undefined` in the plain root-position path (byte-for-byte with the original).
 */
function upperVoice(opts: VoicingOptions): number | undefined {
  return wantsBass(opts) ? 1 : undefined;
}

/**
 * Shared bar-anchored onset emitter for the rhythm path. The necklace is anchored
 * to the ABSOLUTE bar grid and does NOT restart per chord: this walks a hand's
 * absolute onset beats against the sorted chord events (O(n+m) pointer merge) and,
 * for each onset that falls inside a chord, builds notes via `build`. An onset in
 * a gap (before the first chord / after the last) is genuine silence and skipped.
 * The note duration is clipped to the chord's end so a note never rings across a
 * chord change. `events` are pre-sorted by `start` and non-overlapping (chord
 * annotations), and `onsets` are sorted ascending — so the pointer only advances.
 */
function emitRhythmicHand(
  events: ChordEvent[],
  onsets: readonly number[],
  build: (ctx: {
    evIndex: number;
    onsetIndex: number;
    start: number;
    duration: number;
  }) => Note[],
): Note[] {
  const out: Note[] = [];
  let j = 0;
  for (let i = 0; i < onsets.length; i++) {
    const b = onsets[i]!;
    while (j < events.length && events[j]!.end <= b) j++;
    const ev = events[j];
    if (!ev || b < ev.start || b >= ev.end) continue; // silence — no chord here
    const nextOnset = i + 1 < onsets.length ? onsets[i + 1]! : Infinity;
    const duration = Math.min(nextOnset, ev.end) - b;
    out.push(...build({ evIndex: j, onsetIndex: i, start: b, duration }));
  }
  return out;
}

/**
 * Emit a strategy's full rhythmic performance: the chord hand (tones struck per
 * chord onset, selected by `chordTonesAt`) plus the bass hand (one low root per
 * bass onset, `voice: 0`). Shared by all three strategies — each supplies only
 * its per-onset tone selection, so the onset→notes emission lives in one place.
 * Ids are onset-indexed and unique (`-c${i}-${k}` for chord tones, `-b${i}` for
 * bass), and only ever produced on this path.
 */
function voiceRhythm(
  events: ChordEvent[],
  placed: PlacedVoicing[],
  opts: VoicingOptions,
  chordTonesAt: (
    tones: number[],
    onsetIndex: number,
  ) => { pitch: number; k: number }[],
): Note[] {
  const rhythm = opts.rhythm!;
  const { track, bassTrack, idPrefix, velocity = DEFAULT_VELOCITY } = opts;
  const voice = upperVoice(opts);

  const chordNotes = emitRhythmicHand(
    events,
    rhythm.chord,
    ({ evIndex, onsetIndex, start, duration }) =>
      chordTonesAt(placed[evIndex]!.pitches, onsetIndex).map(({ pitch, k }) => ({
        id: `${idPrefix}-c${onsetIndex}-${k}`,
        pitch,
        start,
        duration,
        velocity,
        track,
        voice,
      })),
  );

  const bassNotes = emitRhythmicHand(
    events,
    rhythm.bass,
    ({ evIndex, onsetIndex, start, duration }) => {
      const bass = placed[evIndex]!.bass;
      if (bass === null) return [];
      return [
        {
          id: `${idPrefix}-b${onsetIndex}`,
          pitch: bass,
          start,
          duration,
          velocity,
          track: bassTrack ?? track,
          voice: 0,
        },
      ];
    },
  );

  return [...chordNotes, ...bassNotes];
}

export const VOICINGS: Voicing[] = [
  {
    id: "block-full",
    label: "Block (full chord)",
    voice: (events, opts) => {
      const { track, idPrefix, velocity = DEFAULT_VELOCITY } = opts;
      const placed = placeVoicings(events, opts, (ev) =>
        chordPitches(ev.data, opts.octave),
      );
      if (opts.rhythm) {
        // Strike the whole tone-set at each chord onset.
        return voiceRhythm(events, placed, opts, (tones) =>
          tones.map((pitch, k) => ({ pitch, k })),
        );
      }
      const voice = upperVoice(opts);
      return events.flatMap((ev, i) => [
        ...placed[i]!.pitches.map((pitch, k) => ({
          id: `${idPrefix}-${i}-${k}`,
          pitch,
          start: ev.start,
          duration: ev.end - ev.start,
          velocity,
          track,
          voice,
        })),
        ...bassNote(ev, placed[i]!, i, opts),
      ]);
    },
  },
  {
    id: "block-triad",
    label: "Block triad",
    voice: (events, opts) => {
      const { track, idPrefix, velocity = DEFAULT_VELOCITY } = opts;
      // Triad only: root + 3rd + 5th; drops any 7th / extensions.
      const placed = placeVoicings(events, opts, (ev) =>
        chordPitches(ev.data, opts.octave).slice(0, 3),
      );
      if (opts.rhythm) {
        // Strike the whole (triad) tone-set at each chord onset.
        return voiceRhythm(events, placed, opts, (tones) =>
          tones.map((pitch, k) => ({ pitch, k })),
        );
      }
      const voice = upperVoice(opts);
      return events.flatMap((ev, i) => [
        ...placed[i]!.pitches.map((pitch, k) => ({
          id: `${idPrefix}-${i}-${k}`,
          pitch,
          start: ev.start,
          duration: ev.end - ev.start,
          velocity,
          track,
          voice,
        })),
        ...bassNote(ev, placed[i]!, i, opts),
      ]);
    },
  },
  {
    id: "arpeggio-up",
    label: "Arpeggio (up)",
    voice: (events, opts) => {
      const { track, idPrefix, velocity = DEFAULT_VELOCITY } = opts;
      const placed = placeVoicings(events, opts, (ev) =>
        chordPitches(ev.data, opts.octave),
      );
      if (opts.rhythm) {
        // Spread the chord across successive onsets: onset i sounds tone
        // `i % tones.length`, generalising the arpeggio's "walk up the chord".
        return voiceRhythm(events, placed, opts, (tones, onsetIndex) =>
          tones.length === 0
            ? []
            : [{ pitch: tones[onsetIndex % tones.length]!, k: 0 }],
        );
      }
      const voice = upperVoice(opts);
      return events.flatMap((ev, i) => {
        const tones = placed[i]!.pitches;
        const step = (ev.end - ev.start) / tones.length;
        return [
          ...tones.map((pitch, k) => ({
            id: `${idPrefix}-${i}-${k}`,
            pitch,
            start: ev.start + step * k,
            duration: step,
            velocity,
            track,
            voice,
          })),
          ...bassNote(ev, placed[i]!, i, opts),
        ];
      });
    },
  },
];

export const DEFAULT_VOICING_ID = VOICINGS[0]!.id;

/** Look up a voicing by id; throws loudly on an unknown id. */
export function findVoicing(id: string): Voicing {
  const v = VOICINGS.find((x) => x.id === id);
  if (!v) throw new Error(`[voicing] unknown voicing: ${id}`);
  return v;
}
