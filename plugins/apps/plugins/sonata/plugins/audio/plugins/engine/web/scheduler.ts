import { buildTempoIndex, type Score } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { InstrumentVoices } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/** A running playback schedule; `cancel()` tears down the look-ahead loop. */
export interface ScheduleHandle {
  cancel(): void;
  /**
   * Re-time the not-yet-dispatched tail for a new tempo, anchored at
   * `(newAudioAnchor, newFromBeat)`. A tempo-only change (the speed jog-wheel) is
   * a pure re-timing — note beats/identities are preserved — so it calls this
   * instead of cancel + rebuild: notes already handed to the instrument keep
   * their committed time and **are never cut** (that cutting, ~60×/sec while
   * dragging, is the buzz), and the pump resumes from the same cursor so nothing
   * is double-triggered. `tempoSource` is used ONLY to rebuild the tempo index;
   * the (already mute-filtered) note set is reused untouched.
   */
  retime(tempoSource: Score, newFromBeat: number, newAudioAnchor: number): void;
}

// Keep the look-ahead SHORT. smplr commits a note to the audio graph the instant
// we hand it over (its own look-ahead is 200ms, far wider than ours), locked at the
// tempo in force then — `retime` can't reach a committed note. So THIS window IS the
// lag the audio trails the wheel by while scrubbing: a wide window reads as the song
// dragging behind / "slowing down" on acceleration. We keep it near the perceptual
// floor (~40ms) so tracking feels tight. `retime` also pumps immediately (see below),
// so an in-flight refill never adds extra lag. The trade-off is jank tolerance: this
// is the buffer that absorbs a main-thread stall before a note hands over late, so
// don't drop it to ~0. (A lower floor would need a synth-level rework: a custom small
// smplr scheduler + per-note cancel/reschedule of not-yet-sounded notes.)
const LOOKAHEAD_SEC = 0.04; // schedule this far ahead of the audio clock
const REFILL_SEC = 0.02; // idle-heartbeat refill cadence (retime pumps on demand)

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
 *
 * Routing is per-track: each note carries its `track`, and `resolveVoices(track)`
 * returns the voice manager for that track's resolved instrument — so tracks with
 * distinct timbres sound simultaneously through their own managers. A track whose
 * manager isn't (yet) registered is skipped; resolution upstream always yields a
 * registered id, so this only guards transient gaps.
 */
export function startScheduling(
  score: Score,
  fromBeat: number,
  audioAnchor: number,
  resolveVoices: (trackId: string) => InstrumentVoices | undefined,
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
        track: n.track,
        pitch: n.pitch,
        velocity: n.velocity,
        // Raw beat values retained so `retime` can re-derive seconds under a new
        // tempo index without re-reading the score's notes.
        startBeat: n.start,
        durationBeats: n.duration,
        when: audioAnchor + startSec - t0,
        duration: tempo.beatToSeconds(n.start + n.duration) - startSec,
      };
    })
    .sort((a, b) => a.when - b.when);

  let i = 0;
  let ticker: ConstantSourceNode | null = null;
  let cancelled = false;

  // Tear down the pending wake-up node, if any. Lets `pump` run re-entrantly:
  // `retime` calls it on demand without leaking a second ticker (which would
  // double the pump rate).
  const clearTicker = (): void => {
    if (!ticker) return;
    ticker.onended = null;
    ticker.stop(); // safe: always started; a redundant stop() is a no-op per spec
    ticker.disconnect();
    ticker = null;
  };

  const pump = (): void => {
    if (cancelled) return;
    clearTicker(); // we're pumping now; drop any armed wake so we never run twice
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    for (let note = pending[i]; note && note.when <= horizon; note = pending[++i]) {
      resolveVoices(note.track)?.schedule(note);
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
      clearTicker();
    },
    retime(tempoSource: Score, newFromBeat: number, newAudioAnchor: number): void {
      if (cancelled) return;
      const t = buildTempoIndex(tempoSource);
      const t0n = t.beatToSeconds(newFromBeat);

      // Drop any tail note now behind the new cursor: it is already sounding (or
      // just passed) and must NOT be re-attacked — re-timing it would land its
      // onset in the past and fire it immediately. Advancing `i` past it means the
      // pump never dispatches it. The tail is start-beat-ascending, so once we
      // reach a note at/after the cursor we stop dropping. (Normally a no-op: i has
      // already advanced over dispatched notes; this guards the rAF-advance gap.)
      let head = pending[i];
      while (head && head.startBeat < newFromBeat) {
        i++;
        head = pending[i];
      }

      // Re-derive seconds for the surviving tail under the new tempo, anchored at
      // the same instant the visual cursor re-anchored — so audio stays locked to
      // the cursor. Notes already dispatched (j < i) keep their committed `when`
      // and are left untouched. Rescaling through one monotonic index preserves the
      // ascending-`when` order the pump relies on.
      for (let j = i; j < pending.length; j++) {
        const note = pending[j];
        if (!note) continue;
        const startSec = t.beatToSeconds(note.startBeat);
        note.when = newAudioAnchor + startSec - t0n;
        note.duration =
          t.beatToSeconds(note.startBeat + note.durationBeats) - startSec;
      }

      // Dispatch right away: on acceleration the rescale pulls upcoming notes
      // EARLIER, and waiting up to REFILL_SEC for the next wake would land them
      // late — extra lag that reads as the song dragging behind the wheel. `pump`
      // clears the armed ticker first, so calling it here never double-schedules.
      pump();
    },
  };
}
