import {
  buildTempoIndex,
  resolvePedalSustain,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { InstrumentVoices } from "@plugins/apps/plugins/sonata/plugins/audio/plugins/instruments/web";

/**
 * An A–B practice-loop window in **beats** (already validated `start < end`).
 * When present, the scheduler pre-schedules the loop's notes iteration after
 * iteration with NO teardown, so the audio wraps seamlessly (the visual cursor's
 * deterministic time-fold in the transport mirrors this). `null` = play straight
 * through to the song end.
 */
export interface LoopWindowBeats {
  start: number;
  end: number;
}

/** A running playback schedule; `cancel()` tears down the look-ahead loop. */
export interface ScheduleHandle {
  cancel(): void;
  /**
   * Re-time the not-yet-dispatched tail for a new tempo, re-anchored at the
   * current audio-clock position. A tempo-only change (the speed jog-wheel) is a
   * pure re-timing — note beats/identities and the loop structure are preserved —
   * so it calls this instead of cancel + rebuild: notes already handed to the
   * instrument keep their committed time and **are never cut** (that cutting,
   * ~60×/sec while dragging, is the buzz), and generation resumes from the same
   * cursor so nothing is double-triggered. `tempoSource` is used ONLY to rebuild
   * the tempo index; the (already mute-filtered) note set is reused untouched.
   * `newAudioAnchor` is `ctx.currentTime` captured at the change instant.
   */
  retime(tempoSource: Score, newAudioAnchor: number): void;
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

/** One scheduled note event, in the look-ahead pump's dispatch form. */
interface SchedEvent {
  track: string;
  pitch: number;
  velocity: number;
  /**
   * The note's position on the tempo-invariant **cumulative-beat path** `c`
   * (head beats then loop iterations laid end to end). Identity under tempo
   * changes — `retime` recomputes `when`/`duration` from `c` + `note`, never
   * re-derives `c`.
   */
  c: number;
  /** Source note, retained so a buffered peek can be re-timed on `retime`. */
  note: Note;
  when: number; // absolute AudioContext time (seconds)
  duration: number; // seconds
}

/**
 * Bounded, timer-free playback scheduler. Pulls future notes from a lazy
 * generator (sorted by absolute audio time) and schedules only those inside a
 * short look-ahead window. It re-arms itself via the `onended` of a silent
 * ConstantSourceNode — the audio clock drives every wake-up, so work per pump
 * stays bounded by tempo (never by Score size) and scheduling keeps running even
 * when the tab is backgrounded (unlike rAF). No setInterval / polling.
 *
 * `audioAnchor` is `ctx.currentTime` captured at the play instant; `fromBeat` is
 * the cursor beat at that same instant. Notes are placed on a single monotonic
 * **cumulative-beat coordinate** `c`: the first pass runs `[fromBeat, loop.end)`
 * (or all remaining notes when not looping) at `c = start − fromBeat`, then each
 * loop iteration `k ≥ 1` lays `[loop.start, loop.end)` end to end at
 * `c = (loop.end − fromBeat) + (k−1)(loop.end − loop.start) + (start − loop.start)`.
 * `when(c)` integrates that path through the tempo index from a single fixed
 * anchor, so **a loop wraps with no teardown** — the generator just keeps
 * emitting the next iteration ahead of the boundary (the fix for the audible
 * gap). With no loop the generator runs out at the last note, exactly as before.
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
  loop: LoopWindowBeats | null = null,
): ScheduleHandle {
  let tempo = buildTempoIndex(score);

  const byStart = (a: Note, b: Note): number => a.start - b.start;
  // First pass: notes at/after the resume cursor. A note whose onset is already
  // behind the cursor (e.g. one still sounding when you paused mid-note) must NOT
  // be re-triggered — re-attacking it would replay the previous note. When
  // looping the first pass ends at `loop.end` (the rest is covered by the loop
  // iterations); a start before `loop.start` still plays straight into the loop.
  const headNotes = score.notes
    .filter((n) => n.start >= fromBeat && (!loop || n.start < loop.end))
    .sort(byStart);
  // The looped segment, replayed every iteration after the first pass.
  const loopNotes = loop
    ? score.notes
        .filter((n) => n.start >= loop.start && n.start < loop.end)
        .sort(byStart)
    : [];

  const headLenBeats = loop ? loop.end - fromBeat : 0;
  const loopLenBeats = loop ? loop.end - loop.start : 0;

  // when(c) = anchorWhen + pathSec(c) − anchorPathSec. The anchor is fixed for
  // the schedule's life and only moves on `retime` (which re-derives the played
  // path under the new tempo from the live audio clock).
  let anchorWhen = audioAnchor;
  let anchorC = 0;

  // Cumulative seconds along the played path up to coordinate `c`, under the
  // current tempo. Within the head it is a plain beat→seconds span; past it the
  // whole loop iterations contribute their full seconds-length and the partial
  // last iteration its prefix — so a varying tempo inside the loop is exact.
  const pathSec = (c: number): number => {
    if (!loop || c <= headLenBeats) {
      return tempo.beatToSeconds(fromBeat + c) - tempo.beatToSeconds(fromBeat);
    }
    const loopSec =
      tempo.beatToSeconds(loop.end) - tempo.beatToSeconds(loop.start);
    const r = c - headLenBeats;
    const full = Math.floor(r / loopLenBeats);
    const remBeat = r - full * loopLenBeats;
    return (
      tempo.beatToSeconds(loop.end) -
      tempo.beatToSeconds(fromBeat) +
      full * loopSec +
      (tempo.beatToSeconds(loop.start + remBeat) -
        tempo.beatToSeconds(loop.start))
    );
  };

  // Inverse of `pathSec`: the coordinate `c` whose played path is `sec` seconds.
  // Used by `retime` to find the current position under the OLD tempo before
  // re-anchoring under the new one.
  const pathSecInverse = (sec: number): number => {
    const headSec =
      tempo.beatToSeconds(loop ? loop.end : fromBeat) -
      tempo.beatToSeconds(fromBeat);
    if (!loop || sec <= headSec) {
      return tempo.secondsToBeat(tempo.beatToSeconds(fromBeat) + sec) - fromBeat;
    }
    const loopSec =
      tempo.beatToSeconds(loop.end) - tempo.beatToSeconds(loop.start);
    const r = sec - headSec;
    const full = Math.floor(r / loopSec);
    const remSec = r - full * loopSec;
    const remBeat =
      tempo.secondsToBeat(tempo.beatToSeconds(loop.start) + remSec) - loop.start;
    return headLenBeats + full * loopLenBeats + remBeat;
  };

  let anchorPathSec = pathSec(anchorC); // 0 at build; recomputed on retime
  const whenFor = (c: number): number => anchorWhen + pathSec(c) - anchorPathSec;

  // Sustain-pedal resolution is in BEATS, hence tempo-invariant — compute the
  // per-note extended sounding off-beat ONCE. It survives `retime` untouched
  // (which only rebuilds the tempo index; note beats and the pedal lane are
  // preserved), so a note released under a held pedal keeps ringing to the
  // pedal lift regardless of tempo changes. Notes absent from the map sound for
  // their natural `start + duration`.
  const sustainOff = resolvePedalSustain(score.notes, score.pedalEvents);

  const durationSec = (n: Note): number => {
    const off = sustainOff.get(n) ?? n.start + n.duration;
    return tempo.beatToSeconds(off) - tempo.beatToSeconds(n.start);
  };

  const buildEvent = (n: Note, c: number): SchedEvent => ({
    track: n.track,
    pitch: n.pitch,
    velocity: n.velocity,
    c,
    note: n,
    when: whenFor(c),
    duration: durationSec(n),
  });

  // --- Lazy event generator over the cumulative-beat path. ------------------
  // Holds only indices, so memory is O(1) regardless of how long a loop runs.
  let phase: "head" | "loop" | "done" =
    headNotes.length > 0
      ? "head"
      : loop && loopNotes.length > 0
        ? "loop"
        : "done";
  let hi = 0; // index within headNotes
  let iter = 1; // current loop iteration (1-based)
  let li = 0; // index within loopNotes for the current iteration

  const nextEvent = (): SchedEvent | null => {
    if (phase === "head") {
      if (hi < headNotes.length) {
        const n = headNotes[hi++]!;
        return buildEvent(n, n.start - fromBeat);
      }
      if (loop && loopNotes.length > 0) {
        phase = "loop";
        iter = 1;
        li = 0;
      } else {
        phase = "done";
        return null;
      }
    }
    if (phase === "loop" && loop) {
      if (li >= loopNotes.length) {
        iter++;
        li = 0;
      }
      const n = loopNotes[li++]!;
      const c = headLenBeats + (iter - 1) * loopLenBeats + (n.start - loop.start);
      return buildEvent(n, c);
    }
    return null;
  };

  // One-event look-ahead buffer: the generator is pull-based, so we must peek the
  // next event to test it against the horizon before committing it.
  let peeked: SchedEvent | null = null;
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
    for (;;) {
      if (!peeked) peeked = nextEvent();
      if (!peeked || peeked.when > horizon) break;
      resolveVoices(peeked.track)?.schedule(peeked);
      peeked = null;
    }
    // No more events ever (linear playback ended, or a silent loop window): arm
    // no further wake-ups. A non-empty loop generates forever, so the heartbeat
    // keeps running until `cancel` — the same ~REFILL_SEC cadence as playback.
    if (!peeked) return;

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
    retime(tempoSource: Score, newAudioAnchor: number): void {
      if (cancelled) return;
      // Where are we on the path right now, under the OLD tempo? `when(cNow)` is
      // exactly `ctx.currentTime`, so pathSec(cNow) = now − anchorWhen +
      // anchorPathSec; invert to the cumulative coordinate.
      const cNow = pathSecInverse(
        newAudioAnchor - anchorWhen + anchorPathSec,
      );
      // Switch tempo, then re-anchor so the current position keeps sounding at
      // `now` and everything ahead is re-derived under the new tempo. Notes
      // already handed to the instrument keep their committed time and are never
      // cut (the buzz). Generation continues from its own cursor, which is past
      // `cNow`, so nothing is double-triggered.
      tempo = buildTempoIndex(tempoSource);
      anchorWhen = newAudioAnchor;
      anchorC = cNow;
      anchorPathSec = pathSec(anchorC);
      // The buffered peek was timed under the old anchor — re-derive it.
      if (peeked) {
        peeked.when = whenFor(peeked.c);
        peeked.duration = durationSec(peeked.note);
      }
      // Dispatch right away: on acceleration the rescale pulls upcoming notes
      // EARLIER, and waiting up to REFILL_SEC for the next wake would land them
      // late — extra lag that reads as the song dragging behind the wheel. `pump`
      // clears the armed ticker first, so calling it here never double-schedules.
      pump();
    },
  };
}
