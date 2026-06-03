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
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Sonata } from "./slots";

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
  /** The derived canonical model (empty before a source loads). */
  score: Score;
  /** Playhead position in quarter-note beats. */
  cursorBeat: number;
  isPlaying: boolean;
  activeSourceId: string | null;
  activeDisplayId: string | null;

  setActiveSource: (id: string | null) => void;
  setActiveDisplay: (id: string | null) => void;
  /** Feed raw input from the active source's LoaderComponent. */
  setRaw: (raw: unknown) => void;
  /** Move the playhead (e.g. scrub / seek). */
  setCursorBeat: (beat: number) => void;

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

/** Largest beat referenced by the score — the transport stops here. */
function scoreEndBeat(score: Score): number {
  let end = 0;
  for (const n of score.notes) end = Math.max(end, n.start + n.duration);
  for (const a of score.annotations) end = Math.max(end, a.end);
  return end;
}

export function SonataProvider({ children }: { children: ReactNode }) {
  const sources = Sonata.Source.useContributions();
  const analyzers = Sonata.Analyzer.useContributions();

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null);
  const [raw, setRaw] = useState<unknown>(undefined);
  const [cursorBeat, setCursorBeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Default the active source/display to the first contributed one.
  useEffect(() => {
    if (activeSourceId === null && sources.length > 0) {
      setActiveSourceId(sources[0]!.id);
    }
  }, [activeSourceId, sources]);

  // The active source's compiled Score, then analyzers merged in.
  const score = useMemo<Score>(() => {
    const source = sources.find((s) => s.id === activeSourceId);
    if (!source || raw === undefined) return emptyScore();
    const compiled = source.compile(raw);
    const derived = analyzers.flatMap((a) => a.analyze(compiled));
    return mergeAnnotations(compiled, derived);
  }, [sources, analyzers, activeSourceId, raw]);

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
  // Live mirrors so stable callbacks read current values without re-anchoring.
  const cursorBeatRef = useRef(cursorBeat);
  cursorBeatRef.current = cursorBeat;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Anchor the transport against the current cursor + the given clock's `now()`.
  // Used at play and on every clock swap so play/pause/seek/clock-change compose.
  const reanchor = useCallback((clock: TransportClock) => {
    anchorRef.current = {
      startClockSec: clock.now(),
      startBeat: cursorBeatRef.current,
      startScoreSec: beatToSeconds(scoreRef.current, cursorBeatRef.current),
    };
  }, []);

  const registerClock = useCallback(
    (clock: TransportClock) => {
      clockRef.current = clock;
      if (isPlayingRef.current) reanchor(clock);
      return () => {
        if (clockRef.current === clock) {
          clockRef.current = wallClock;
          if (isPlayingRef.current) reanchor(wallClock);
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

  useEffect(() => {
    if (!isPlaying) {
      anchorRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const endBeat = scoreEndBeat(scoreRef.current);
    // Anchor against the current cursor + active clock so play/pause/seek compose.
    reanchor(clockRef.current);

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const elapsedSeconds =
        clockRef.current.now() - anchor.startClockSec + anchor.startScoreSec;

      // Invert beatToSeconds: advance beats until seconds(beat) >= elapsed.
      const score = scoreRef.current;
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

  const value = useMemo<SonataContextValue>(
    () => ({
      score,
      cursorBeat,
      isPlaying,
      activeSourceId,
      activeDisplayId,
      setActiveSource: setActiveSourceId,
      setActiveDisplay: setActiveDisplayId,
      setRaw,
      setCursorBeat,
      play,
      stop,
      registerClock,
    }),
    [
      score,
      cursorBeat,
      isPlaying,
      activeSourceId,
      activeDisplayId,
      play,
      stop,
      registerClock,
    ],
  );

  return (
    <SonataContext.Provider value={value}>{children}</SonataContext.Provider>
  );
}
