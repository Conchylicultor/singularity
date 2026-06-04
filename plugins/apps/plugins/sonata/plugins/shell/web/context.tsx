import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  beatToSeconds,
  emptyScore,
  mergeAnnotations,
  scaleTempo,
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Sonata } from "./slots";
import { publishSonataTransport } from "./transport-store";

/** Tempo scale clamp — slowest 0.25× (quarter speed) to fastest 4× (quadruple). */
const MIN_TEMPO_SCALE = 0.25;
const MAX_TEMPO_SCALE = 4;

/**
 * Shared Sonata state + transport.
 *
 *  - `score` is *derived*: compile the active source's raw input, then merge in
 *    every `Sonata.Analyzer`'s output (`source:"derived"`, never clobbering
 *    authored truth).
 *  - The transport is a `requestAnimationFrame` loop (no polling / setInterval)
 *    that advances `cursorBeat` by mapping elapsed wall-clock seconds back
 *    through the tempo map. Displays read the cursor.
 */
/**
 * A monotonic time source in seconds. The default is the wall clock
 * (`performance.now`); the audio engine registers an `AudioContext.currentTime`
 * clock so the visual cursor reads the *same* clock the audio is scheduled
 * against — eliminating drift and keeping the playhead correct across tab
 * backgrounding.
 */
export interface TransportClock {
  /** Current time in seconds (same units/origin the audio scheduler uses). */
  now(): number;
}

export interface SonataContextValue {
  /**
   * The derived canonical model (empty before a source loads), with the current
   * `tempoScale` already folded into its tempo map — so displays, audio, and the
   * transport cursor all share one consistent timeline.
   */
  score: Score;
  /** Playhead position in quarter-note beats. */
  cursorBeat: number;
  isPlaying: boolean;
  /** Playback tempo multiplier (1 = authored tempo). */
  tempoScale: number;
  activeSourceId: string | null;
  activeDisplayId: string | null;
  /**
   * Monotonic counter bumped on every seek (absolute or relative). Re-anchoring
   * the transport moves the playback origin without changing `score`, so anchored
   * consumers that can't read the live anchor ref reactively — notably the audio
   * scheduler — depend on this to restart from the new cursor. The visual rAF
   * cursor doesn't need it (it reads the anchor ref every frame).
   */
  seekEpoch: number;

  setActiveSource: (id: string | null) => void;
  setActiveDisplay: (id: string | null) => void;
  /** Feed raw input from the active source's LoaderComponent. */
  setRaw: (raw: unknown) => void;
  /** Move the playhead (e.g. scrub / seek). */
  setCursorBeat: (beat: number) => void;
  /** Nudge the playhead by `deltaBeat` beats, clamped to [0, end]; re-anchors playback. */
  seekBy: (deltaBeat: number) => void;
  /** Seek the playhead to an absolute `beat`, clamped to [0, end]; re-anchors playback. */
  seekTo: (beat: number) => void;
  /** Set the playback tempo multiplier (clamped to [0.25, 4]). */
  setTempoScale: (scale: number) => void;

  play: () => void;
  stop: () => void;

  /**
   * Register the authoritative playback clock (e.g. the audio engine's
   * `AudioContext`). Returns an unregister that restores the wall-clock default.
   * Swapping the clock mid-playback re-anchors so the cursor stays continuous.
   */
  registerClock: (clock: TransportClock) => () => void;
}

const SonataContext = createContext<SonataContextValue | null>(null);

/** Read the shared Sonata context. Throws outside `<SonataProvider>`. */
export function useSonata(): SonataContextValue {
  const ctx = useContext(SonataContext);
  if (!ctx) {
    throw new Error("useSonata must be used within <SonataProvider>");
  }
  return ctx;
}

/** The default time source: the browser wall clock, in seconds. */
const wallClock: TransportClock = { now: () => performance.now() / 1000 };

export function SonataProvider({ children }: { children: ReactNode }) {
  const sources = Sonata.Source.useContributions();
  const analyzers = Sonata.Analyzer.useContributions();

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null);
  const [raw, setRaw] = useState<unknown>(undefined);
  const [cursorBeat, setCursorBeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempoScale, setTempoScaleState] = useState(1);
  // Bumped on every seek so the audio scheduler can restart from the new cursor.
  const [seekEpoch, setSeekEpoch] = useState(0);

  // Default the active source/display to the first contributed one.
  useEffect(() => {
    if (activeSourceId === null && sources.length > 0) {
      setActiveSourceId(sources[0]!.id);
    }
  }, [activeSourceId, sources]);

  // The active source's compiled Score, then analyzers merged in.
  const baseScore = useMemo<Score>(() => {
    const source = sources.find((s) => s.id === activeSourceId);
    if (!source || raw === undefined) return emptyScore();
    const compiled = source.compile(raw);
    const derived = analyzers.flatMap((a) => a.analyze(compiled));
    return mergeAnnotations(compiled, derived);
  }, [sources, analyzers, activeSourceId, raw]);

  // Fold the tempo scale into the tempo map ONCE here, so every consumer — the
  // transport loop below, the audio scheduler, and the displays — reads a single
  // consistent timeline. Beats are untouched (analyzers already ran on the
  // unscaled score), only the beat→seconds mapping speeds up or slows down.
  const score = useMemo<Score>(
    () => scaleTempo(baseScore, tempoScale),
    [baseScore, tempoScale],
  );

  // Reset the cursor whenever the underlying source/raw changes.
  useEffect(() => {
    setCursorBeat(0);
    setIsPlaying(false);
  }, [activeSourceId, raw]);

  // --- Transport: a requestAnimationFrame loop (no polling). ----------------
  // We anchor at the playback clock's time + beat where playback started, then
  // each frame invert the tempo map: find the beat whose `beatToSeconds` equals
  // the elapsed seconds. The time source is the pluggable `clockRef` — the audio
  // engine registers its `AudioContext.currentTime`, so the cursor and the audio
  // share one clock and never drift. rAF only sets the *render cadence*; it no
  // longer supplies the time value (so a backgrounded-then-resumed tab reads the
  // live clock and lands the cursor exactly where the sound is).
  // Monotone search keeps it O(beats advanced) per frame.
  const rafRef = useRef<number | null>(null);
  const anchorRef = useRef<{
    startClockSec: number;
    startBeat: number;
    startScoreSec: number;
  } | null>(null);
  const clockRef = useRef<TransportClock>(wallClock);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  // Live mirrors so stable callbacks (seek, re-anchor, clock swaps, store
  // actions) read current values WITHOUT depending on them and re-anchoring.
  const cursorBeatRef = useRef(cursorBeat);
  cursorBeatRef.current = cursorBeat;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const tempoScaleRef = useRef(tempoScale);
  tempoScaleRef.current = tempoScale;

  // Anchor the transport at `beat` against the active clock's `now()`. Used at
  // play, on every clock swap, and on seek / tempo change so they all compose.
  // The audio scheduler re-anchors in lock-step via its own score-dep effect, so
  // sound stays glued to the cursor.
  const reanchor = useCallback((beat: number) => {
    anchorRef.current = {
      startClockSec: clockRef.current.now(),
      startBeat: beat,
      startScoreSec: beatToSeconds(scoreRef.current, beat),
    };
  }, []);

  const registerClock = useCallback(
    (clock: TransportClock) => {
      clockRef.current = clock;
      if (isPlayingRef.current) reanchor(cursorBeatRef.current);
      return () => {
        if (clockRef.current === clock) {
          clockRef.current = wallClock;
          if (isPlayingRef.current) reanchor(cursorBeatRef.current);
        }
      };
    },
    [reanchor],
  );

  const stop = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (scoreEndBeat(scoreRef.current) <= 0) return;
    setIsPlaying(true);
  }, []);

  // Absolute seek — the primitive the progression bar drives. Clamps to the
  // score span and re-anchors so the audio/cursor stay glued while playing.
  // Stable (reads refs internally), so pointer handlers stay correct mid-drag.
  const seekTo = useCallback(
    (beat: number) => {
      const end = scoreEndBeat(scoreRef.current);
      const next = Math.max(0, Math.min(end, beat));
      setCursorBeat(next);
      reanchor(next);
      // Signal anchored consumers (the audio scheduler) to restart from `next`.
      // The score is unchanged, so without this the audio would keep playing
      // from the pre-seek position while only the visual cursor jumps.
      setSeekEpoch((n) => n + 1);
    },
    [reanchor],
  );

  // Relative seek (keyboard arrows) delegates to the absolute primitive.
  const seekBy = useCallback(
    (deltaBeat: number) => seekTo(cursorBeatRef.current + deltaBeat),
    [seekTo],
  );

  const setTempoScale = useCallback((scale: number) => {
    const clamped = Math.max(
      MIN_TEMPO_SCALE,
      Math.min(MAX_TEMPO_SCALE, scale),
    );
    // Round to a tidy 0.05 grid so repeated nudges don't accrue float drift.
    setTempoScaleState(Math.round(clamped * 20) / 20);
  }, []);

  // A tempo change rescales `score` mid-flight; re-anchor at the current cursor so
  // the visual transport doesn't jump (audio re-anchors via its score-dep effect).
  useEffect(() => {
    reanchor(cursorBeatRef.current);
  }, [score, reanchor]);

  useEffect(() => {
    if (!isPlaying) {
      anchorRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Anchor against the current cursor + active clock so play/pause/seek compose.
    reanchor(cursorBeatRef.current);

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      // Recompute origin seconds + end from the anchor each frame so seeks and
      // tempo changes (which rewrite the anchor / score) take effect seamlessly.
      const score = scoreRef.current;
      const endBeat = scoreEndBeat(score);
      const elapsedSeconds =
        clockRef.current.now() - anchor.startClockSec + anchor.startScoreSec;

      // Invert beatToSeconds: advance beats until seconds(beat) >= elapsed.
      let beat = anchor.startBeat;
      const STEP = 0.01; // beats; fine enough for a smooth cursor at 60fps.
      let guard = 0;
      while (
        beatToSeconds(score, beat) < elapsedSeconds &&
        beat < endBeat &&
        guard++ < 1_000_000
      ) {
        beat += STEP;
      }
      if (beat >= endBeat) {
        setCursorBeat(endBeat);
        setIsPlaying(false);
        return;
      }
      setCursorBeat(beat);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // Re-anchor only on play/stop transitions (and clock swaps, handled in
    // registerClock) — not on every cursor change; the loop owns cursorBeat
    // while playing. `reanchor` is stable.
  }, [isPlaying, reanchor]);

  // Publish the transport to the module-level bus so global keyboard shortcuts
  // (which run outside React) can drive the active Sonata. Stable callbacks +
  // refs mean we publish once on mount and clear on unmount.
  useEffect(() => {
    publishSonataTransport({
      togglePlay: () => (isPlayingRef.current ? stop() : play()),
      seekBy,
      nudgeTempo: (delta) => setTempoScale(tempoScaleRef.current + delta),
    });
    return () => publishSonataTransport(null);
  }, [play, stop, seekBy, setTempoScale]);

  const value = useMemo<SonataContextValue>(
    () => ({
      score,
      cursorBeat,
      isPlaying,
      tempoScale,
      activeSourceId,
      activeDisplayId,
      seekEpoch,
      setActiveSource: setActiveSourceId,
      setActiveDisplay: setActiveDisplayId,
      setRaw,
      setCursorBeat,
      seekBy,
      seekTo,
      setTempoScale,
      play,
      stop,
      registerClock,
    }),
    [
      score,
      cursorBeat,
      isPlaying,
      tempoScale,
      activeSourceId,
      activeDisplayId,
      seekEpoch,
      seekBy,
      seekTo,
      setTempoScale,
      play,
      stop,
      registerClock,
    ],
  );

  return (
    <SonataContext.Provider value={value}>{children}</SonataContext.Provider>
  );
}
