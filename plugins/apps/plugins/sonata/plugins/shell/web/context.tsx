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
  // We anchor at the wall-clock time + beat where playback started, then each
  // frame invert the tempo map: find the beat whose `beatToSeconds` equals the
  // elapsed seconds. Monotone search keeps it O(beats advanced) per frame.
  const rafRef = useRef<number | null>(null);
  const anchorRef = useRef<{ startMs: number; startBeat: number } | null>(null);
  const scoreRef = useRef(score);
  scoreRef.current = score;

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
    // Anchor against the current cursor so play/pause/seek compose.
    anchorRef.current = {
      startMs: performance.now(),
      startBeat: cursorBeat,
    };
    const startSeconds = beatToSeconds(scoreRef.current, cursorBeat);

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const elapsedSeconds =
        (performance.now() - anchor.startMs) / 1000 + startSeconds;

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
    // We intentionally re-anchor only on play/stop transitions, not on every
    // cursor change (the loop owns cursorBeat while playing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

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
    }),
    [
      score,
      cursorBeat,
      isPlaying,
      activeSourceId,
      activeDisplayId,
      play,
      stop,
    ],
  );

  return (
    <SonataContext.Provider value={value}>{children}</SonataContext.Provider>
  );
}
