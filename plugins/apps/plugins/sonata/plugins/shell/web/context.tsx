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
  currentLine,
  mergeAnnotations,
  mergeScores,
  nextLine,
  prevLine,
  scaleTempo,
  scoreEndBeat,
  spellScore,
  subdivideBars,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { inferKeys } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { Sonata } from "./slots";

/** Tempo scale clamp — slowest 0× (frozen / 0%) to fastest 4× (quadruple). */
const MIN_TEMPO_SCALE = 0;
const MAX_TEMPO_SCALE = 4;

/**
 * The smallest tempo factor the beat↔seconds math ever sees. At a literal 0×
 * the tempo map collapses to 0 bpm — infinite seconds per beat — which makes
 * `beatToSeconds` non-finite and propagates `NaN` through the transport, the
 * audio scheduler, and the piano-roll geometry (which multiplies seconds by the
 * scale, so `Infinity × 0 = NaN`). 0% is instead modeled as a *frozen* transport
 * (playback is paused; see `play`/the freeze effect below), so the cursor never
 * advances and this floor is never observable — it exists purely to keep the
 * tempo map finite. It fully cancels in the piano-roll geometry, so the exact
 * value doesn't affect layout.
 */
export const TEMPO_MATH_FLOOR = 0.05;

/**
 * How finely the seek grid subdivides a bar at a given playback tempo: a whole
 * bar at authored tempo or faster, then halving each time the tempo halves
 * (half-bar at ≤50%, quarter-bar at ≤25%, eighth-bar at ≤12.5%, …). The
 * invariant is that one tap rewinds a roughly *constant wall-clock duration* —
 * about one bar at authored tempo — so slowing down to practice a dense passage
 * automatically buys finer-grained seeking, with no tuned threshold. Floored at
 * `TEMPO_MATH_FLOOR` so a frozen 0% can't diverge to an unbounded subdivision.
 */
function seekSubdivisions(tempoScale: number): number {
  const scale = Math.max(tempoScale, TEMPO_MATH_FLOOR);
  if (scale >= 1) return 1;
  return 2 ** Math.floor(Math.log2(1 / scale));
}

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
  /** Title of the song currently open in the player (null on the library). */
  currentSongTitle: string | null;
  /** Id of the song currently open in the player (null on the library). Lets
   *  player-scoped effects attribute a play to a specific song. */
  currentSongId: string | null;
  /**
   * Monotonic counter bumped on every `setCurrentSong` call — including reopening
   * the *same* song. Effects that should fire once per open (e.g. recording a play
   * on the first Play press) key their "already handled" guard on this so a fresh
   * open re-arms them while pause→resume within one open does not. Each player
   * open is a fresh `mode:"root"` pane instance, so the player surface's mount
   * effect calls `setCurrentSong` exactly once per open.
   */
  songOpenEpoch: number;
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
   * Read a specific source's persisted raw (or `undefined`). Generic, source-
   * keyed accessor — unlike `activeRaw` it does NOT depend on `activeSourceId`,
   * so a source's own editor section (e.g. the chord-grid editor) can read its
   * raw directly. Reactive: identity changes whenever any source's raw changes.
   */
  sourceRaw: (sourceId: string) => unknown;
  /**
   * Write a specific source's raw (merges one key). The source-keyed companion
   * to `setRaw` — recompiles the composed score immediately, without touching
   * `activeSourceId`. Used by per-source editor sections.
   */
  setSourceRaw: (sourceId: string, raw: unknown) => void;
  /**
   * Rename the song currently open in the player (updates `currentSongTitle` so
   * the player header stays in sync with an in-editor title edit). Persistence is
   * the editing source's responsibility; this only updates the in-memory title.
   */
  renameCurrentSong: (title: string) => void;
  /**
   * Bulk, source-agnostic raw write — set the full `{ sourceId: raw }` map,
   * REPLACING the current inputs (not merging). Unlike `setRaw` this does NOT
   * depend on (or change) `activeSourceId`; the library uses it to load a song's
   * complete set of persisted per-source inputs in one shot.
   */
  setRawMap: (rawMap: Record<string, unknown>) => void;
  /**
   * Mark a song as the one currently open: sets `currentSongId`/`currentSongTitle`
   * and bumps `songOpenEpoch` (re-arms once-per-open effects, even for the same
   * song). Called by the player surface on mount — each open is a fresh
   * `mode:"root"` pane instance, so this fires exactly once per open.
   */
  setCurrentSong: (song: { id: string; title: string }) => void;
  /**
   * Clear the open-song state (nulls `currentSongId`/`currentSongTitle`). Called
   * by the player surface on unmount so library-state effects don't mis-attribute
   * a play to a song that is no longer on screen.
   */
  clearCurrentSong: () => void;
  /**
   * Toggle play/pause from the current cursor. Stable; the player surface
   * publishes it to the global transport bus while mounted, so the gate on
   * "player on screen" is implicit (the bus is empty on the library).
   */
  togglePlay: () => void;
  /** Nudge the playback tempo scale by `delta` (e.g. +0.1 = 10% faster). */
  nudgeTempo: (delta: number) => void;
  /** Move the playhead (e.g. scrub / seek). */
  setCursorBeat: (beat: number) => void;
  /** Nudge the playhead by `deltaBeat` beats, clamped to [0, end]; re-anchors playback. */
  seekBy: (deltaBeat: number) => void;
  /** Seek the playhead to an absolute `beat`, clamped to [0, end]; re-anchors playback. */
  seekTo: (beat: number) => void;
  /**
   * Single-press jump along the tempo-adaptive seek grid (`-1` back / `+1`
   * forward): a whole bar at authored tempo, finer the more the tempo is slowed
   * for practice (half-bar, quarter-bar, …; see `seekSubdivisions`). Backward
   * uses a half-unit pivot — past the middle of the current unit it snaps to that
   * unit's start, otherwise to the previous unit — so a tap is always an
   * immediate, meaningful jump and repeated taps walk strictly backward.
   */
  seekBar: (direction: -1 | 1) => void;
  /**
   * Begin a held repeat in `direction` (press-and-hold): steps along the same
   * tempo-adaptive seek grid at an accelerating cadence until `endScrub` —
   * discrete jumps, not a smooth glide. Playback is suspended for the duration
   * and restored on release (mirroring the piano-roll drag-scrub's pause-on-grab
   * / resume-on-settle), so the rapid stepping never thrashes the audio scheduler.
   */
  startScrub: (direction: -1 | 1) => void;
  /** End an in-progress {@link startScrub}: commit the landing beat and, if
   *  playback was running when the hold began, resume it from there. */
  endScrub: () => void;
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

  // Open-song state. Navigation itself is URL-driven via the pane router (the
  // library index pane and the player pane); this only tracks which song the
  // player surface currently has on screen, so player-scoped effects can
  // attribute playback to it.
  const [currentSongTitle, setCurrentSongTitle] = useState<string | null>(null);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [songOpenEpoch, setSongOpenEpoch] = useState(0);

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

  // Source-keyed raw write (merges one key). The generic primitive both `setRaw`
  // and per-source editor sections build on; never touches `activeSourceId`.
  const setSourceRaw = useCallback((sourceId: string, raw: unknown) => {
    setRawById((prev) => ({ ...prev, [sourceId]: raw }));
  }, []);

  // `setRaw` writes the *active* source's slot. Read the active id from a ref so
  // the callback stays stable (loaders depend on its identity in effects).
  const activeSourceIdRef = useRef(activeSourceId);
  activeSourceIdRef.current = activeSourceId;
  const setRaw = useCallback(
    (raw: unknown) => {
      const id = activeSourceIdRef.current;
      if (!id) return;
      setSourceRaw(id, raw);
    },
    [setSourceRaw],
  );

  // Bulk, source-agnostic raw write (does NOT touch activeSourceId). Used by the
  // library to load a song's complete set of per-source inputs in one shot.
  // REPLACES the prior raw map (rather than merging) so opening a song never
  // leaves a previously-opened song's source inputs lingering — each open shows
  // exactly the new song's sources.
  const setRawMap = useCallback(
    (m: Record<string, unknown>) => setRawById(m),
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
    // Two pure pre-analysis steps establish key context: inferKeys derives the
    // tonal centre(s) from the notes (when no key is authored), then spellScore
    // fills each note's enharmonic `spelling` from the key in force. Order
    // matters — inference first, so both note-spelling and the chord analyzer
    // (which reads `effectiveKeyAt`) see the key.
    const keyed = inferKeys(merged); // theory/core
    const spelled = spellScore(keyed); // score/core
    const derived = analyzers.flatMap((a) => a.analyze(spelled));
    return mergeAnnotations(spelled, derived);
  }, [sources, analyzers, rawById]);

  // Fold the tempo scale into the tempo map ONCE here, so every consumer — the
  // transport loop below, the audio scheduler, and the displays — reads a single
  // consistent timeline. Beats are untouched (analyzers already ran on the
  // unscaled score), only the beat→seconds mapping speeds up or slows down.
  const score = useMemo<Score>(
    () => scaleTempo(baseScore, Math.max(tempoScale, TEMPO_MATH_FLOOR)),
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
    // 0% is a frozen transport — there is nothing to advance, so don't start.
    if (tempoScaleRef.current === 0) return;
    setIsPlaying(true);
  }, []);

  // Open-song lifecycle. The player surface calls `setCurrentSong` on mount —
  // each open is a fresh `mode:"root"` pane instance, so this fires once per open
  // and the epoch bump re-arms once-per-open effects (even for the same song).
  // The existing `useEffect([baseScore])` auto-stops + rewinds when raw changes.
  const setCurrentSong = useCallback((song: { id: string; title: string }) => {
    setCurrentSongId(song.id);
    setCurrentSongTitle(song.title);
    // Bump every open (even the same song) so once-per-open effects re-arm.
    setSongOpenEpoch((n) => n + 1);
  }, []);

  // The player surface calls this on unmount so library-state effects don't
  // mis-attribute playback to a song that is no longer on screen.
  const clearCurrentSong = useCallback(() => {
    setCurrentSongId(null);
    setCurrentSongTitle(null);
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

  // Single-press jump along the tempo-adaptive seek grid (a whole bar at normal
  // speed, finer as the tempo is slowed; see `seekSubdivisions`). Goes through
  // `seekTo`, so a tap while playing jumps the audio and keeps going. Reads the
  // live cursor + score + tempo from refs so it stays stable.
  const seekBar = useCallback(
    (direction: -1 | 1) => {
      const score = scoreRef.current;
      const here = cursorBeatRef.current;
      const end = scoreEndBeat(score);
      const grid = subdivideBars(score, seekSubdivisions(tempoScaleRef.current));
      if (direction > 0) {
        seekTo(nextLine(grid, here, end));
        return;
      }
      // Backward: half-unit pivot. Past the middle of the current unit → snap to
      // its start (replay this unit); in the first half → step to the previous
      // unit. The target is always ≤ the current line ≤ here, so repeated taps
      // walk strictly backward — drift-proof while playing, with no play/pause
      // special-case (this subsumes the old `currentBarLine` anchor).
      const cur = currentLine(grid, here);
      const next = nextLine(grid, here, end);
      seekTo(here > (cur + next) / 2 ? cur : prevLine(grid, cur));
    },
    [seekTo],
  );

  // --- Press-and-hold repeat. ----------------------------------------------
  // A self-driven rAF loop that steps the cursor bar-by-bar at an accelerating
  // cadence while a control is held — discrete jumps (NOT a smooth glide), like
  // holding the rewind key in a media player. Playback is suspended for the
  // duration so the rapid stepping never re-anchors / restarts the audio
  // scheduler per step (the old flicker); a single clean re-anchor happens in
  // `endScrub`. Cadence timing reads the wall clock directly (`performance.now`),
  // NOT the transport clock: while paused the audio clock (`ctx.currentTime`) is
  // frozen, so it would report `dt = 0` and the hold would never advance.
  const scrubRafRef = useRef<number | null>(null);
  const scrubWasPlayingRef = useRef(false);

  const startScrub = useCallback((direction: -1 | 1) => {
    if (scrubRafRef.current !== null) return; // already holding
    const score = scoreRef.current;
    const end = scoreEndBeat(score);
    if (end <= 0) return;

    // The seek grid for this hold — captured once: playback is suspended for the
    // duration, so neither the score nor the tempo can shift the unit mid-hold.
    const grid = subdivideBars(score, seekSubdivisions(tempoScaleRef.current));

    // Suspend playback while holding; remember whether to resume on release.
    scrubWasPlayingRef.current = isPlayingRef.current;
    if (isPlayingRef.current) setIsPlaying(false);

    // Seconds between bar steps: starts spaced out so a brief hold steps a few
    // bars, then tightens the longer it's held so a far rewind doesn't crawl.
    const START_INTERVAL = 0.16;
    const MIN_INTERVAL = 0.05;
    const ACCEL = 0.06; // interval shaved per second held

    let last = performance.now() / 1000;
    let held = 0;
    let acc = 0;
    const step = () => {
      const now = performance.now() / 1000;
      const dt = now - last;
      last = now;
      held += dt;
      acc += dt;
      const interval = Math.max(MIN_INTERVAL, START_INTERVAL - held * ACCEL);
      if (acc >= interval) {
        acc = 0;
        const here = cursorBeatRef.current;
        const next =
          direction < 0 ? prevLine(grid, here) : nextLine(grid, here, end);
        // Move the visual cursor directly — no `seekTo` (no re-anchor / seekEpoch
        // bump) since playback is suspended. Keep the ref in sync for the next
        // step + the final `endScrub` commit.
        if (next !== here) {
          cursorBeatRef.current = next;
          setCursorBeat(next);
        }
      }
      scrubRafRef.current = requestAnimationFrame(step);
    };
    scrubRafRef.current = requestAnimationFrame(step);
  }, []);

  const endScrub = useCallback(() => {
    if (scrubRafRef.current === null) return;
    cancelAnimationFrame(scrubRafRef.current);
    scrubRafRef.current = null;
    if (scrubWasPlayingRef.current) {
      // Resuming re-anchors at the landing beat and reschedules audio once.
      scrubWasPlayingRef.current = false;
      play();
    } else {
      // Paused: commit the landing beat (re-anchor + signal once) so a later
      // play starts from exactly where the scrub stopped.
      seekTo(cursorBeatRef.current);
    }
  }, [play, seekTo]);

  // Cancel any in-flight scrub loop on unmount so the rAF doesn't outlive us.
  useEffect(() => {
    return () => {
      if (scrubRafRef.current !== null) cancelAnimationFrame(scrubRafRef.current);
    };
  }, []);

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

  // 0% speed freezes the transport: pause so neither the cursor nor the audio
  // advances. Stepping the speed back up requires pressing play again.
  useEffect(() => {
    if (tempoScale === 0) setIsPlaying(false);
  }, [tempoScale]);

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

  // Stable transport verbs the player surface publishes to the module-level bus
  // (for out-of-React global keyboard shortcuts) while it is mounted. Publishing
  // only from the player makes the "player on screen" gate implicit — the bus is
  // empty on the library, so Space/arrows are inert there with no `view` check.
  const togglePlay = useCallback(() => {
    isPlayingRef.current ? stop() : play();
  }, [play, stop]);

  const nudgeTempo = useCallback(
    (delta: number) => setTempoScale(tempoScaleRef.current + delta),
    [setTempoScale],
  );

  const loadedSourceIds = useMemo(
    () => Object.keys(rawById).filter((id) => rawById[id] !== undefined),
    [rawById],
  );

  const activeRaw = activeSourceId ? rawById[activeSourceId] : undefined;

  // Source-keyed raw read. Recreated when `rawById` changes so consumers re-render
  // with fresh raw (e.g. the chord-grid editor reflecting a hydrated song).
  const sourceRaw = useCallback(
    (sourceId: string) => rawById[sourceId],
    [rawById],
  );

  // Rename the open song in-memory so the player header tracks an in-editor edit.
  const renameCurrentSong = useCallback(
    (title: string) => setCurrentSongTitle(title),
    [],
  );

  const value = useMemo<SonataContextValue>(
    () => ({
      score,
      currentSongTitle,
      currentSongId,
      songOpenEpoch,
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
      sourceRaw,
      setSourceRaw,
      renameCurrentSong,
      setRawMap,
      setCurrentSong,
      clearCurrentSong,
      togglePlay,
      nudgeTempo,
      setCursorBeat,
      seekBy,
      seekTo,
      seekBar,
      startScrub,
      endScrub,
      setTempoScale,
      play,
      stop,
      registerClock,
    }),
    [
      score,
      currentSongTitle,
      currentSongId,
      songOpenEpoch,
      cursorBeat,
      isPlaying,
      tempoScale,
      activeSourceId,
      activeDisplayId,
      seekEpoch,
      loadedSourceIds,
      activeRaw,
      setRaw,
      sourceRaw,
      setSourceRaw,
      renameCurrentSong,
      setRawMap,
      setCurrentSong,
      clearCurrentSong,
      togglePlay,
      nudgeTempo,
      seekBy,
      seekTo,
      seekBar,
      startScrub,
      endScrub,
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
