import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildTempoIndex,
  emptyScore,
  currentLine,
  foldLoopTime,
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
import { reVoiceChords, voicingConfig } from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { useConfig } from "@plugins/config_v2/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { Sonata } from "./slots";
import { useCursorApi } from "./cursor-store";
import { useKeyAutoDetect } from "./key-mode-store";

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
 * Vertical-zoom ("spread") clamp for the piano roll — how tall the falling notes
 * render. Ephemeral transport state (the persisted default lives in
 * `pianoRollConfig.spread`); the display threads it through its geometry. Kept
 * here next to the tempo clamp because both are transport-level display knobs
 * the shell owns and shares between the toolbar control and the renderer.
 */
const MIN_SPREAD = 0.4;
const MAX_SPREAD = 3;

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

/**
 * An A–B practice loop range, in beats. `enabled` gates whether the transport
 * actually wraps at `end`; a defined-but-disabled loop stays visible (faded) so
 * the user can keep the markers while playing straight through.
 */
export interface LoopRange {
  start: number;
  end: number;
  enabled: boolean;
}

/**
 * Smallest gap (in beats) between a loop's `start` and `end`, enforced in
 * `setLoop` so the two handles can never cross or collapse to a degenerate
 * zero-length range (which would make the rAF wrap thrash). Sibling of
 * `TEMPO_MATH_FLOOR`: a tiny structural floor that keeps the transport math
 * well-behaved.
 */
const LOOP_MIN_GAP = 1;

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
  isPlaying: boolean;
  /** Playback tempo multiplier (1 = authored tempo). */
  tempoScale: number;
  /**
   * Piano-roll vertical zoom (1 = base). Ephemeral, live-adjustable display
   * state shared between the toolbar's spread control and the renderer — like
   * `tempoScale`, but it scales note HEIGHTS too (the Synthesia "taller notes"
   * zoom). The persisted default lives in `pianoRollConfig.spread`; the
   * piano-roll seeds this from it on load and writes back on commit.
   */
  spread: number;
  /**
   * Live clamp for {@link spread}. `spreadMax` is constant; `spreadMin` is
   * DYNAMIC — the renderer lowers it (via {@link setSpreadFloor}) to the
   * "fit the whole song" zoom so the user can keep zooming out until the entire
   * song is visible. Long songs push it below the default floor; short songs keep
   * it. The toolbar wheel reads this range so a full sweep always spans exactly
   * what's reachable.
   */
  spreadMin: number;
  spreadMax: number;
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
  /**
   * The active A–B practice loop range (beats), or `null` when no region is
   * set. When `loop.enabled`, the transport rAF wraps from `loop.end` back to
   * `loop.start` instead of running to the song end. A defined-but-disabled
   * loop stays in state (the marker shows it faded) so the bounds survive a
   * play-through.
   */
  loop: LoopRange | null;
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
   * Toggle play/pause from the current cursor. Stable; the controls plugin
   * registers it as a per-surface, focus-scoped Space shortcut while a song is
   * open, so each Sonata window toggles only its own transport.
   */
  togglePlay: () => void;
  /** Nudge the playback tempo scale by `delta` (e.g. +0.1 = 10% faster). */
  nudgeTempo: (delta: number) => void;
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
  /**
   * Set (or clear, with `null`) the A–B practice loop. Clamps `start`/`end`
   * into the score span with a minimum gap so the handles never cross, and
   * clears the loop on an empty score. Stable (reads the live score from a ref).
   */
  setLoop: (next: LoopRange | null) => void;
  /** Set the playback tempo multiplier (clamped to [0.25, 4]). */
  setTempoScale: (scale: number) => void;
  /** Set the piano-roll vertical zoom (clamped to [{@link spreadMin}, {@link
   *  spreadMax}]). Continuous — no rounding — so a jog-wheel / pinch drag stays
   *  buttery. */
  setSpread: (spread: number) => void;
  /** Lower the live zoom-out floor ({@link spreadMin}) to the renderer-computed
   *  "fit the whole song" spread. Capped at the default floor — long songs lower
   *  it (so you can zoom out until everything fits), short songs keep the default.
   *  The renderer is the sole caller: it alone measures the lane height. */
  setSpreadFloor: (min: number) => void;

  play: () => void;
  stop: () => void;
  /**
   * Arm a one-shot "auto-play once the next loaded song's score is composed".
   * The library's background-play affordance calls this right after `setRawMap`
   * + `setCurrentSong`, so the song starts playing in place (no navigation) as
   * soon as the recomposed score is ready. Consumed exactly once by the
   * score-change reset effect; a no-op if the score ends up empty.
   */
  requestPlayOnLoad: () => void;

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
  // Per-song key-source override (per-surface scoped store, written by the
  // `key-mode` plugin's observer / the key-readout toggle). When on, the score
  // pipeline ignores the authored key and infers it from the notes — see
  // `baseScore`.
  const keyAutoDetect = useKeyAutoDetect();
  // Global chord-voicing config (realistic toggle / strategy / octave). Read
  // reactively here so toggling it re-derives the score below — chord notes are
  // (re)generated from authored chord annotations in `baseScore`.
  const voicing = useConfig(voicingConfig);
  // The per-surface cursor store's imperative facade. Resolves to the
  // `<CursorStoreProvider>` mounted in `SonataLayout` (wrapping this provider),
  // so every surface gets its own playhead. Memoized on the stable store, so it
  // is referentially stable across renders — safe to read directly in the rAF
  // loop and stable callbacks without a ref. The provider is the sole writer
  // (`cursor.setBeat`); reads use `cursor.getBeat()`.
  const cursor = useCursorApi();

  // Open-song state. Navigation itself is URL-driven via the pane router (the
  // library index pane and the player pane); this only tracks which song the
  // player surface currently has on screen, so player-scoped effects can
  // attribute playback to it.
  const [currentSongTitle, setCurrentSongTitle] = useState<string | null>(null);
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [songOpenEpoch, setSongOpenEpoch] = useState(0);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  // The effective active source defaults to the first contributed one until the
  // user explicitly picks one — derived in render rather than mirrored into
  // `activeSourceId` via an effect, so there is never a frame where no source is
  // selected (and no extra render cycle). `activeSourceId` holds only the user's
  // explicit pick (null = "no pick yet, fall back to the first source").
  const effectiveSourceId = activeSourceId ?? sources[0]?.id ?? null;
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null);
  // Raw input keyed by source id — each source keeps its own input so they
  // accumulate and merge, rather than one active source replacing another.
  const [rawById, setRawById] = useState<Record<string, unknown>>({});
  // The playhead lives in the per-surface cursor store (not React state) so the
  // ~60fps transport advance doesn't re-render every `useSonata()` consumer. The
  // provider is the sole writer (`cursor.setBeat`); reads use `cursor.getBeat()`.
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempoScale, setTempoScaleState] = useState(1);
  // Piano-roll vertical zoom. Seeded from pianoRollConfig.spread by the display
  // on load; the 1 here is a pre-seed placeholder for the brief first frame.
  const [spread, setSpreadState] = useState(1);
  // Dynamic zoom-out floor. The renderer lowers it to the "fit whole song" spread
  // (see setSpreadFloor); long songs push it below MIN_SPREAD so the user can zoom
  // out until the entire song is visible. Read through a ref so the stable
  // setSpread callback always clamps against the current floor.
  const [spreadMin, setSpreadMinState] = useState(MIN_SPREAD);
  const spreadMinRef = useLatestRef(spreadMin);
  // Bumped on every seek so the audio scheduler can restart from the new cursor.
  const [seekEpoch, setSeekEpoch] = useState(0);
  // A–B practice loop range (beats), or null when unset. The rAF tick reads it
  // through a ref so the running loop never re-runs its effect when the range
  // changes (mirroring scoreRef/tempoIndexRef).
  const [loop, setLoopState] = useState<LoopRange | null>(null);
  const loopRef = useLatestRef(loop);

  // Source-keyed raw write (merges one key). The generic primitive both `setRaw`
  // and per-source editor sections build on; never touches `activeSourceId`.
  const setSourceRaw = useCallback((sourceId: string, raw: unknown) => {
    setRawById((prev) => ({ ...prev, [sourceId]: raw }));
  }, []);

  // `setRaw` writes the *active* source's slot. Read the active id from a ref so
  // the callback stays stable (loaders depend on its identity in effects).
  // Mirror the *effective* id so writes target the defaulted first source even
  // before the user makes an explicit pick.
  const activeSourceIdRef = useLatestRef(effectiveSourceId);
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
    // Regenerate chord notes from authored chord annotations under the global
    // voicing config (realistic voice-leading / strategy / octave). Runs BEFORE
    // key inference + spelling so the chord notes exist for key detection and
    // get enharmonic spellings. No-op when there are no authored chord
    // annotations (returns the score unchanged).
    const voiced = reVoiceChords(merged, voicing);
    // Two pure pre-analysis steps establish key context: inferKeys derives the
    // tonal centre(s) from the notes (when no key is authored), then spellScore
    // fills each note's enharmonic `spelling` from the key in force. Order
    // matters — inference first, so both note-spelling and the chord analyzer
    // (which reads `effectiveKeyAt`) see the key.
    // `force` ignores any authored key (strips meta.key + authored key
    // annotations) so the song is treated as keyless and the key is inferred —
    // the per-song "auto-detect key" override.
    const keyed = inferKeys(voiced, { force: keyAutoDetect }); // theory/core
    const spelled = spellScore(keyed); // score/core
    const derived = analyzers.flatMap((a) => a.analyze(spelled));
    return mergeAnnotations(spelled, derived);
  }, [sources, analyzers, rawById, keyAutoDetect, voicing]);

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
  // Zero-based A–B loop iteration the cursor is currently in, tracked so the rAF
  // tick can flag a wrap (iteration change) to the cursor store as a `seek` —
  // making onset-driven consumers (the piano-roll FX) re-anchor instead of
  // spraying every note between B and A. Reset to 0 on every (re)anchor, since a
  // fresh anchor restarts the deterministic loop fold from iteration 0.
  const loopIterRef = useRef(0);
  // One-shot "auto-play once the freshly-loaded score is composed" intent, set
  // by the library's background-play affordance and consumed by the score-reset
  // effect below. A ref (not state) so arming it never triggers a render.
  const playOnLoadRef = useRef(false);
  const scoreRef = useLatestRef(score);
  const tempoIndexRef = useLatestRef(tempoIndex);
  // Live mirrors so stable callbacks (seek, re-anchor, clock swaps, store
  // actions) read current values WITHOUT depending on them and re-anchoring.
  // The cursor's live value comes from the store via `cursor.getBeat()`.
  const isPlayingRef = useLatestRef(isPlaying);
  const tempoScaleRef = useLatestRef(tempoScale);

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
    // A fresh anchor restarts the loop fold; clear the iteration tracker so the
    // next wrap (iter 0 → 1) is detected rather than mistaken for a continuation.
    loopIterRef.current = 0;
  }, []);

  const registerClock = useCallback(
    (clock: TransportClock) => {
      clockRef.current = clock;
      if (isPlayingRef.current) reanchor(cursor.getBeat());
      return () => {
        if (clockRef.current === clock) {
          clockRef.current = wallClock;
          if (isPlayingRef.current) reanchor(cursor.getBeat());
        }
      };
    },
    [reanchor, cursor],
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

  const requestPlayOnLoad = useCallback(() => {
    playOnLoadRef.current = true;
  }, []);

  // Reset the cursor whenever the composed Score changes (new/changed input).
  // `baseScore` is referentially stable across mere source-picker switches
  // (which don't change `rawById`), so switching the visible Loader does NOT
  // reset the playhead — only loading or editing input does. If the library
  // armed `requestPlayOnLoad` (background "Play" on a card/row), start playback
  // from the top once the new score is composed instead of stopping; `play`'s
  // own guards keep an empty/0% score from starting.
  useEffect(() => {
    cursor.setBeat(0, { seek: true });
    // Drop any A–B loop: it belongs to the previous content's beat span. Cleared
    // unconditionally (even when auto-playing) so a freshly loaded song never
    // inherits a stale practice loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional transport reset on score change: clearing the loop is paired with the imperative cursor rewind above, not derivable in render
    setLoopState(null);
    if (playOnLoadRef.current) {
      playOnLoadRef.current = false;
      // Re-base the transport to beat 0 BEFORE (re)starting. When the previous
      // song was already playing, `isPlaying` stays true across the switch, so
      // `play()` causes no play/pause transition and the rAF loop — still
      // anchored to the previous song — would clobber the `setBeat(0)` above on
      // its next tick. Re-anchoring here (and bumping `seekEpoch` so the audio
      // scheduler restarts from the new cursor) makes every loaded song start
      // from the top, whether or not playback was already running.
      reanchor(0);
      setSeekEpoch((n) => n + 1);
      play();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional transport reset on score change: loading/editing new content imperatively rewinds the cursor (cursor.setBeat) and stops playback; this is a genuine side-effect (paired with the imperative cursor write), not derivable in render
      setIsPlaying(false);
    }
  }, [baseScore, cursor, play, reanchor]);

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
      cursor.setBeat(next, { seek: true });
      reanchor(next);
      // Signal anchored consumers (the audio scheduler) to restart from `next`.
      // The score is unchanged, so without this the audio would keep playing
      // from the pre-seek position while only the visual cursor jumps.
      setSeekEpoch((n) => n + 1);
    },
    [reanchor, cursor],
  );

  // Relative seek (keyboard arrows) delegates to the absolute primitive.
  const seekBy = useCallback(
    (deltaBeat: number) => seekTo(cursor.getBeat() + deltaBeat),
    [seekTo, cursor],
  );

  // Single-press jump along the tempo-adaptive seek grid (a whole bar at normal
  // speed, finer as the tempo is slowed; see `seekSubdivisions`). Goes through
  // `seekTo`, so a tap while playing jumps the audio and keeps going. Reads the
  // live cursor + score + tempo from refs so it stays stable.
  const seekBar = useCallback(
    (direction: -1 | 1) => {
      const score = scoreRef.current;
      const here = cursor.getBeat();
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
    [seekTo, cursor],
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
        const here = cursor.getBeat();
        const next =
          direction < 0 ? prevLine(grid, here) : nextLine(grid, here, end);
        // Move the visual cursor directly — no `seekTo` (no re-anchor / seekEpoch
        // bump) since playback is suspended. The store write is read back by the
        // next step's `cursor.getBeat()` and the final `endScrub` commit. A
        // bar-jump is navigation, not playback — flag it a seek so onset FX
        // don't fire on every step.
        if (next !== here) cursor.setBeat(next, { seek: true });
      }
      scrubRafRef.current = requestAnimationFrame(step);
    };
    scrubRafRef.current = requestAnimationFrame(step);
  }, [cursor]);

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
      seekTo(cursor.getBeat());
    }
  }, [play, seekTo, cursor]);

  // Cancel any in-flight scrub loop on unmount so the rAF doesn't outlive us.
  useEffect(() => {
    return () => {
      if (scrubRafRef.current !== null) cancelAnimationFrame(scrubRafRef.current);
    };
  }, []);

  // Set / clear the A–B loop. Reads the live score from `scoreRef` so it stays
  // stable. `null` clears; an empty score (`scoreEndBeat <= 0`) can't host a
  // loop, so it clears too. Otherwise clamp both edges into [0, end] and keep a
  // `LOOP_MIN_GAP` between them so the handles can never cross or collapse.
  const setLoop = useCallback((next: LoopRange | null) => {
    if (!next) {
      setLoopState(null);
      return;
    }
    const end = scoreEndBeat(scoreRef.current);
    if (end <= 0) {
      setLoopState(null);
      return;
    }
    const start = Math.max(0, Math.min(next.start, end - LOOP_MIN_GAP));
    const stop = Math.max(start + LOOP_MIN_GAP, Math.min(next.end, end));
    setLoopState({ start, end: stop, enabled: next.enabled });
  }, []);

  // Continuous (clamp only, no grid) so a jog-wheel / pinch drag scrubs smoothly
  // with fine-grained control and a clean release fling — the same shape as
  // `setSpread`. The tidy 0.05 grid lives in `nudgeTempo`, where repeated
  // *relative* additions are the only thing that would accrue float drift.
  const setTempoScale = useCallback((scale: number) => {
    setTempoScaleState(
      Math.max(MIN_TEMPO_SCALE, Math.min(MAX_TEMPO_SCALE, scale)),
    );
  }, []);

  // Continuous (like the tempo scrub) so a jog-wheel / pinch drag is smooth; the
  // persisted config field carries the tidy step for the settings editor.
  // Clamps against the live (dynamic) floor so zoom-out can reach "fit the song".
  const setSpread = useCallback((next: number) => {
    setSpreadState(Math.max(spreadMinRef.current, Math.min(MAX_SPREAD, next)));
  }, []);

  // The renderer feeds the "fit whole song" floor; cap at the default (short
  // songs already fit well above it) and reject non-positive / non-finite input.
  const setSpreadFloor = useCallback((min: number) => {
    setSpreadMinState(
      Number.isFinite(min) && min > 0 ? Math.min(MIN_SPREAD, min) : MIN_SPREAD,
    );
  }, []);

  // When the floor rises again (shorter song, slower tempo), an earlier-written
  // raw `spread` may fall below the new reachable minimum. Re-clamp into
  // [floor, MAX] in render rather than via an effect that re-writes the state —
  // so the wheel/renderer never show a value below the reachable minimum and
  // there's no extra render cycle. `spread` state still holds the user's intent;
  // `setSpread` clamps against the floor at write time (this handles a *later*
  // floor rise).
  const effectiveSpread = Math.max(spreadMin, Math.min(MAX_SPREAD, spread));

  // A tempo change rescales `score` (and `tempoIndex`) mid-flight; re-anchor at
  // the current cursor so the visual transport doesn't jump.
  //
  // This MUST be a layout effect, not a passive one. `scoreRef`/`tempoIndexRef`
  // are `useLatestRef`s that flip to the new tempo *during render*, but the
  // anchor (`anchorRef.startScoreSec`, in score-seconds of the OLD tempo) is only
  // corrected here. A passive `useEffect` can run a frame AFTER the next rAF
  // transport tick, leaving that tick to invert new-tempo seconds against an
  // old-tempo anchor — a beat jump proportional to the absolute song position
  // (large, very visible, and continuous while the speed wheel is dragged).
  // A layout effect runs synchronously in the commit phase, before the next
  // tick, so the anchor and the index the tick reads always agree. (audio
  // re-anchors via its own score-dep effect.)
  useLayoutEffect(() => {
    reanchor(cursor.getBeat());
  }, [score, reanchor, cursor]);

  // 0% speed freezes the transport: pause so neither the cursor nor the audio
  // advances. Stepping the speed back up requires pressing play again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: freeze transport at 0% tempo (a 0× scale cannot advance the cursor); this is a transport state transition triggered by the user dialing tempo to 0 while playing, not derivable in render (isPlaying is imperative play/pause state)
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
    reanchor(cursor.getBeat());

    const tick = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      // Recompute origin seconds + end from the anchor each frame so seeks and
      // tempo changes (which rewrite the anchor / score) take effect seamlessly.
      const score = scoreRef.current;
      const endBeat = scoreEndBeat(score);
      const idx = tempoIndexRef.current;
      const rawSeconds =
        clockRef.current.now() - anchor.startClockSec + anchor.startScoreSec;

      // A–B practice loop: fold the monotonic elapsed score-time into the [A, B)
      // window deterministically (no teardown — the seamless-loop fix). The audio
      // scheduler pre-schedules the same iterations from the same anchor + bounds,
      // so the cursor and the sound wrap together with zero re-sync. A wrap is
      // just a change in the fold's iteration count; on it we flag the cursor
      // write as a `seek` so onset-driven FX re-anchor instead of spraying every
      // note between B and A. The fold runs BEFORE the song-end stop so a loop
      // ending exactly at the song end still cycles its tail rather than stopping.
      const loop = loopRef.current;
      const win =
        loop && loop.enabled && loop.end > loop.start
          ? {
              startSec: idx.beatToSeconds(loop.start),
              endSec: idx.beatToSeconds(loop.end),
            }
          : null;
      const folded = foldLoopTime(rawSeconds, win);

      if (win) {
        const beat = idx.secondsToBeat(folded.sec);
        const wrapped = folded.iter !== loopIterRef.current;
        loopIterRef.current = folded.iter;
        cursor.setBeat(beat, wrapped ? { seek: true } : undefined);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Invert seconds→beats in closed form (O(log n)) and clamp to the song
      // end. The index isn't clamped to scoreEndBeat, so we clamp here.
      const beat = Math.min(endBeat, idx.secondsToBeat(folded.sec));
      if (beat >= endBeat) {
        cursor.setBeat(endBeat);
        setIsPlaying(false);
        return;
      }
      cursor.setBeat(beat);
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
    // while playing. `reanchor` and `cursor` are both stable (memoized), and the
    // `scoreRef` / `tempoIndexRef` latest-value handles have stable identity, so
    // this effect still only re-runs on the play/stop transition.
  }, [isPlaying, reanchor, cursor]);

  // Re-anchor when the A–B loop region changes mid-play. The deterministic loop
  // fold is sensitive to the bounds, so without this a bounds change would snap
  // the cursor to `rawSeconds mod newLoopLength` instead of continuing from the
  // current position. Re-anchoring at the live cursor restarts the fold cleanly
  // from here (iteration reset) — in lockstep with the audio engine, which
  // rebuilds its schedule from the same cursor on the same change. A *stable*
  // loop never re-runs this, so a repeated wrap stays anchor-stable and seamless.
  // Only meaningful while playing; `reanchor`/`cursor` are stable.
  useEffect(() => {
    if (isPlayingRef.current) reanchor(cursor.getBeat());
  }, [loop?.start, loop?.end, loop?.enabled, reanchor, cursor]);

  // Stable transport verbs the controls plugin registers as per-surface, focus-
  // scoped keyboard shortcuts (Space / ↑ / ↓ and the ←/→ seek-hold controller),
  // each gated on a song being open (`currentSongId`) so they are inert on the
  // library and never cross between two open Sonata windows.
  const togglePlay = useCallback(() => {
    isPlayingRef.current ? stop() : play();
  }, [play, stop]);

  // ↑/↓ keyboard steps: snap the result onto the tidy 0.05 grid so taps land on
  // round percentages (and never accrue float drift), even when the wheel left
  // tempo on a fine off-grid value.
  const nudgeTempo = useCallback(
    (delta: number) =>
      setTempoScale(Math.round((tempoScaleRef.current + delta) * 20) / 20),
    [setTempoScale],
  );

  const loadedSourceIds = useMemo(
    () => Object.keys(rawById).filter((id) => rawById[id] !== undefined),
    [rawById],
  );

  const activeRaw = effectiveSourceId ? rawById[effectiveSourceId] : undefined;

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
      isPlaying,
      tempoScale,
      spread: effectiveSpread,
      spreadMin,
      spreadMax: MAX_SPREAD,
      activeSourceId: effectiveSourceId,
      activeDisplayId,
      seekEpoch,
      loop,
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
      seekBy,
      seekTo,
      seekBar,
      startScrub,
      endScrub,
      setLoop,
      setTempoScale,
      setSpread,
      setSpreadFloor,
      play,
      stop,
      requestPlayOnLoad,
      registerClock,
    }),
    [
      score,
      currentSongTitle,
      currentSongId,
      songOpenEpoch,
      isPlaying,
      tempoScale,
      effectiveSpread,
      spreadMin,
      effectiveSourceId,
      activeDisplayId,
      seekEpoch,
      loop,
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
      setLoop,
      setTempoScale,
      setSpread,
      setSpreadFloor,
      play,
      stop,
      requestPlayOnLoad,
      registerClock,
    ],
  );

  // Fold every contributed per-surface provider around the children, INSIDE the
  // SonataContext so contributed wrappers may `useSonata()`. This lets a plugin
  // the shell can't import (cycle) inject one provider above a surface's whole
  // subtree — e.g. an audio engine and a volume control in different slot
  // branches sharing one per-surface context.
  return (
    <SonataContext.Provider value={value}>
      <Sonata.SurfaceProvider.Wrap>{children}</Sonata.SurfaceProvider.Wrap>
    </SonataContext.Provider>
  );
}
