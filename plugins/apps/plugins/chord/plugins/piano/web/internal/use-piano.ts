import { useCallback, useEffect, useRef } from "react";
import {
  SonataAudio,
  type InstrumentVoices,
} from "@plugins/apps/plugins/sonata/plugins/audio/plugins/instruments/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";

/** How long a struck chord rings, in seconds. */
const RING_SECONDS = 1.4;
/** The gap between two notes of a chord, low to high: a strum, not a block. */
const STRUM_SECONDS = 0.018;
/** Scheduling slack after "now", so the first note is never in the past. */
const LEAD_SECONDS = 0.03;
/** MIDI velocity of the bass note; the upper notes are a little softer. */
const BASS_VELOCITY = 84;
const UPPER_VELOCITY = 70;

/** The Chord app's piano: one AudioContext and one voice set, for this screen. */
type PianoGraph = {
  ctx: AudioContext;
  voices: InstrumentVoices;
};

/**
 * Sonata's default instrument (the sampled grand), played on this screen's own
 * `AudioContext`.
 *
 * Lifecycle (the first consumer outside Sonata, so it is spelled out):
 * - **Created on the first chord played**, inside the click that asked for it.
 *   So the samples download only when a chord is first played, and the context
 *   is born inside a user gesture, which is what lets it start running.
 * - **One per screen**: later chords reuse the same context and voices, and the
 *   screen hands this ONE instance to everything that sounds — the chord
 *   buttons, the answer boxes, and the keyboard's own playable keys. A second
 *   `usePiano()` would open a second context beside it. Each new sound cuts the
 *   one before it (`allOff`), so nothing piles up.
 * - **Disposed on unmount**: the voices, then the context.
 *
 * The instrument is read generically from `SonataAudio.Instrument` (the one
 * contribution marked `default`), never by name. A failure — no default
 * instrument, or samples that fail to load — rejects the returned promise.
 */
export function usePiano(): (pitches: readonly number[]) => Promise<void> {
  const instruments = SonataAudio.Instrument.useContributions();
  const instrumentsRef = useLatestRef(instruments);
  const graphRef = useRef<PianoGraph | null>(null);

  useEffect(
    () => () => {
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph === null) return;
      graph.voices.dispose();
      if (graph.ctx.state !== "closed") void graph.ctx.close();
    },
    [],
  );

  return useCallback(
    async (pitches: readonly number[]) => {
      let graph = graphRef.current;
      if (graph === null) {
        const instrument = instrumentsRef.current.find((i) => i.default);
        if (instrument === undefined) {
          throw new Error(
            "No default instrument is registered on SonataAudio.Instrument: the piano cannot play",
          );
        }
        const ctx = new AudioContext();
        graph = { ctx, voices: instrument.createVoices(ctx, ctx.destination) };
        graphRef.current = graph;
      }
      const { ctx, voices } = graph;
      // A context created or suspended outside a gesture starts suspended.
      if (ctx.state === "suspended") await ctx.resume();
      await voices.loaded;
      // Unmounted while the samples loaded: nothing left to play into.
      if (graphRef.current !== graph) return;
      voices.allOff();
      const start = ctx.currentTime + LEAD_SECONDS;
      pitches.forEach((pitch, i) => {
        voices.schedule({
          pitch,
          velocity: i === 0 ? BASS_VELOCITY : UPPER_VELOCITY,
          when: start + i * STRUM_SECONDS,
          duration: RING_SECONDS,
        });
      });
    },
    [instrumentsRef],
  );
}
