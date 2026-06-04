import { buildTempoIndex, type Score } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { InstrumentVoices } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/** A running playback schedule; `cancel()` tears down the look-ahead loop. */
export interface ScheduleHandle {
  cancel(): void;
}

const LOOKAHEAD_SEC = 1.5; // schedule this far ahead of the audio clock
const REFILL_SEC = 0.75; // wake to refill when ~half the window remains

/**
 * Bounded, timer-free playback scheduler. Builds the future-note play-list once
 * (sorted by absolute audio time), then schedules only the notes inside a short
 * look-ahead window. It re-arms itself via the `onended` of a silent
 * ConstantSourceNode — the audio clock drives every wake-up, so work per pump
 * stays bounded by tempo (never by Score size) and scheduling keeps running even
 * when the tab is backgrounded (unlike rAF). No setInterval / polling.
 *
 * `audioAnchor` is `ctx.currentTime` captured at the play instant; `fromBeat` is
 * the cursor beat at that same instant. Each note's beat-onset is mapped to an
 * absolute audio time (reusing the same tempo index, so audio shares the
 * cursor's tempo map) and Web Audio fires it sample-accurately.
 */
export function startScheduling(
  score: Score,
  fromBeat: number,
  audioAnchor: number,
  voices: InstrumentVoices,
  ctx: AudioContext,
): ScheduleHandle {
  const tempo = buildTempoIndex(score);
  const t0 = tempo.beatToSeconds(fromBeat);
  const pending = score.notes
    // Only attack notes whose onset is at/after the resume cursor. A note whose
    // onset is already behind the cursor (e.g. one still sounding when you paused
    // mid-note) must NOT be re-triggered — re-attacking it from its start would
    // replay the previous note on resume. Its `when` would also land in the past
    // (`startSec < t0`), firing it immediately. So drop every past-onset note.
    .filter((n) => n.start >= fromBeat)
    .map((n) => {
      const startSec = tempo.beatToSeconds(n.start);
      return {
        pitch: n.pitch,
        velocity: n.velocity,
        when: audioAnchor + startSec - t0,
        duration: tempo.beatToSeconds(n.start + n.duration) - startSec,
      };
    })
    .sort((a, b) => a.when - b.when);

  let i = 0;
  let ticker: ConstantSourceNode | null = null;
  let cancelled = false;

  const pump = (): void => {
    if (cancelled) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    for (let note = pending[i]; note && note.when <= horizon; note = pending[++i]) {
      voices.schedule(note);
    }
    if (i >= pending.length) return; // everything scheduled; arm no further wake-ups

    // Wake again on the audio clock (no JS timer) to refill the window. A
    // ConstantSourceNode with offset 0 is silent; its `onended` fires at `stop`.
    const node = new ConstantSourceNode(ctx, { offset: 0 });
    node.connect(ctx.destination);
    node.onended = () => {
      node.disconnect();
      if (ticker === node) ticker = null;
      pump();
    };
    node.start();
    node.stop(ctx.currentTime + REFILL_SEC);
    ticker = node;
  };

  pump();

  return {
    cancel(): void {
      cancelled = true;
      if (ticker) {
        ticker.onended = null;
        ticker.stop(); // safe: always started; a redundant stop() is a no-op per spec
        ticker.disconnect();
        ticker = null;
      }
    },
  };
}
