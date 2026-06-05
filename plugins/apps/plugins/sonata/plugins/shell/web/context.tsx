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
  buildTempoIndex,
  emptyScore,
  mergeAnnotations,
  mergeScores,
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
 *  - `score` is *derived* and *composed*: every source that has raw input is
 *    compiled, the compiled Scores are merged via `mergeScores` (so a chord grid
 *    and a MIDI file layer into one Score), then every `Sonata.Analyzer`'s
 *    output is merged in (`source:"derived"`, never clobbering authored truth).
 *    `activeSourceId` only chooses which Loader is shown — the Score reflects all
 *    loaded sources.
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
  /**
   * The app's navigation view. `"library"` is the landing surface (the song
   * gallery, contributed via `Sonata.Home`); `"player"` is the streamlined
   * playback chrome for the current song.
   */
  view: "library" | "player";
  /** Title of the song currently open in the player (null on the library). */
  currentSongTitle: string | null;
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
  /** Ids of sources that currently have raw input (so the UI can badge them). */
  loadedSourceIds: string[];
  /** The active source's persisted raw input, so its Loader can be controlled. */
  activeRaw: unknown;

  setActiveSource: (id: string | null) => void;
  setActiveDisplay: (id: string | null) => void;
  /** Feed raw input from the active source's LoaderComponent (keyed by source). */
  setRaw: (raw: unknown) => void;
  /**
   * Bulk, source-agnostic raw write — merge a `{ sourceId: raw }` map into the
   * accumulated raw inputs. Unlike `setRaw` this does NOT depend on (or change)
   * `activeSourceId`; the library uses it to load a song's persisted inputs.
   */
  setRawMap: (rawMap: Record<string, unknown>) => void;
  /** Open the player on `title` (sets `currentSongTitle` + `view="player"`). */
  openPlayer: (title: string) => void;
  /** Return to the library: stops playback, then `view="library"`. */
  backToLibrary: () => void;
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

  // Navigation: the app lands on the library and switches into the player.
  const [view, setView] = useState<"library" | "player">("library");
  const [currentSongTitle, setCurrentSongTitle] = useState<string | null>(null);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null);
  // Raw input keyed by source id — each source keeps its own input so they
  // accumulate and merge, rather than one active source replacing another.
  const [rawById, setRawById] = useState<Record<string, unknown>>({});
  const [cursorBeat, setCursorBeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempoScale, setTempoScaleState] = useState(1);
  // Bumped on every seek so the audio scheduler can restart from the new cursor.
  const [seekEpoch, setSeekEpoch] = useState(0);

  // `setRaw` writes the *active* source's slot. Read the active id from a ref so
  // the callback stays stable (loaders depend on its identity in effects).
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const setRaw = useCallback((raw: unknown) => {
    const id = activeSourceIdRef.current;
    if (!id) return;
    setRawById((prev) => ({ ...prev, [id]: raw }));
  }, []);

  // Bulk, source-agnostic raw write (does NOT touch activeSourceId). Used by the
  // library to load a song's persisted per-source inputs in one shot.
  const setRawMap = useCallback(
    (m: Record<string, unknown>) =>
      setRawById((prev) => ({ ...prev, ...m })),
    [],
  );

  // Default the active source/display to the first contributed one.
  useEffect(() => {
    if (activeSourceId === null && sources.length > 0) {
      setActiveSourceId(sources[0]!.id);
    }
  }, [activeSourceId, sources]);

  // Compose the Score: compile every source with input, merge them (in source
  // contribution order), then merge analyzer output. A source that authors no
  // tempo/time-sig (e.g. the chord grid emits empty maps) defers to one that
  // does via `mergeScores`' first-non-empty rule — so a merged MIDI file owns
  // the timeline with no special-casing here.
  const baseScore = useMemo<Score>(() => {
    const compiled = sources
      .filter((s) => rawById[s.id] !== undefined)
      .map((s) => s.compile(rawById[s.id]));
    if (compiled.length === 0) return emptyScore();
    const merged = mergeScores(compiled);
    const derived = analyzers.flatMap((a) => a.analyze(merged));
    return mergeAnnotations(merged, derived);
  }, [sources, analyzers, rawById]);

  // Fold the tempo scale into the tempo map ONCE here, so every consumer — the
  // transport loop below, the audio scheduler, and the displays — reads a single
  // consistent timeline. Beats are untouched (analyzers already ran on the
  // unscaled score), only the beat→seconds mapping speeds up or slows down.
  const score = useMemo<Score>(
    () => scaleTempo(baseScore, tempoScale),
    [baseScore, tempoScale],
  );

  // Precompute the beat↔seconds index once per score. Both directions are
  // O(log n) closed-form, so the transport loop and reanchor read a single,
  // allocation-free tempo-time source instead of re-sorting the tempo map.
  const tempoIndex = useMemo(() => buildTempoIndex(score), [score]);

  // Reset the cursor whenever the composed Score changes (new/changed input).
  // `baseScore` is referentially stable across mere source-picker switches
  // (which don't change `rawById`), so switching the visible Loader does NOT
  // reset the playhead — only loading or editing input does.
  useEffect(() => {
    setCursorBeat(0);
    setIsPlaying(false);
  }, [baseScore]);

  // --- Transport: a requestAnimationFrame loop (no polling). ----------------
  // We anchor at the playback clock's time + beat where playback started, then
  // each frame invert the tempo map: find the beat whose `beatToSeconds` equals
  // the elapsed seconds. The time source is the pluggable `clockRef` — the audio
  // engine registers its `AudioContext.currentTime`, so the cursor and the audio
  // share one clock and never drift. rAF only sets the *render cadence*; it no
  // longer supplies the time value (so a backgrounded-then-resumed tab reads the
  // live clock and lands the cursor exactly where the sound is).
  // The inversion is closed-form via the tempo index, so each frame is O(log n)
  // in the tempo-map size — constant cost regardless of how long playback runs.
  const rafRef = useRef<number | null>(null);
  const anchorRef = useRef<{
    startClockSec: number;
    startBeat: number;
    startScoreSec: number;
  } | null>(null);
  const clockRef = useRef<TransportClock>(wallClock);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const tempoIndexRef = useRef(tempoIndex);
  tempoIndexRef.current = tempoIndex;
  // Live mirrors so stable callbacks (seek, re-anchor, clock swaps, store
  // actions) read current values WITHOUT depending on them and re-anchoring.
  const cursorBeatRef = useRef(cursorBeat);
  cursorBeatRef.current = cursorBeat;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const tempoScaleRef = useRef(tempoScale);
  tempoScaleRef.current = tempoScale;
  // Mirror the nav view so the published (stable) transport callbacks can gate
  // on it without re-publishing — keyboard shortcuts must only drive the player.
  const viewRef = useRef(view);
  viewRef.current = view;

  // Anchor the transport at `beat` against the active clock's `now()`. Used at
  // play, on every clock swap, and on seek / tempo change so they all compose.
  // The audio scheduler re-anchors in lock-step via its own score-dep effect, so
  // sound stays glued to the cursor.
  const reanchor = useCallback((beat: number) => {
    anchorRef.current = {
      startClockSec: clockRef.current.now(),
      startBeat: beat,
      startScoreSec: tempoIndexRef.current.beatToSeconds(beat),
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

  // Navigation actions. Opening a song switches to the player; the existing
  // `useEffect([baseScore])` auto-stops + rewinds when its raw input changes.
  const openPlayer = useCallback((title: string) => {
    setCurrentSongTitle(title);
    setView("player");
  }, []);

  const backToLibrary = useCallback(() => {
    stop();
    setView("library");
  }, [stop]);

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

      // Invert seconds→beats in closed form (O(log n)) and clamp to the song
      // end. The index isn't clamped to scoreEndBeat, so we clamp here.
      const beat = Math.min(
        endBeat,
        tempoIndexRef.current.secondsToBeat(elapsedSeconds),
      );
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
      // Gate transport on the player view so global Space/arrows don't start
      // playback while the user is on the library landing surface.
      togglePlay: () => {
        if (viewRef.current !== "player") return;
        isPlayingRef.current ? stop() : play();
      },
      seekBy,
      nudgeTempo: (delta) => setTempoScale(tempoScaleRef.current + delta),
    });
    return () => publishSonataTransport(null);
  }, [play, stop, seekBy, setTempoScale]);

  const loadedSourceIds = useMemo(
    () => Object.keys(rawById).filter((id) => rawById[id] !== undefined),
    [rawById],
  );

  const activeRaw = activeSourceId ? rawById[activeSourceId] : undefined;

  const value = useMemo<SonataContextValue>(
    () => ({
      score,
      view,
      currentSongTitle,
      cursorBeat,
      isPlaying,
      tempoScale,
      activeSourceId,
      activeDisplayId,
      seekEpoch,
      loadedSourceIds,
      activeRaw,
      setActiveSource: setActiveSourceId,
      setActiveDisplay: setActiveDisplayId,
      setRaw,
      setRawMap,
      openPlayer,
      backToLibrary,
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
      view,
      currentSongTitle,
      cursorBeat,
      isPlaying,
      tempoScale,
      activeSourceId,
      activeDisplayId,
      seekEpoch,
      loadedSourceIds,
      activeRaw,
      setRaw,
      setRawMap,
      openPlayer,
      backToLibrary,
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
