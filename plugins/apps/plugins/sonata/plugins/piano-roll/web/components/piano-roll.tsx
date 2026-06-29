import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import {
  bars,
  buildTempoIndex,
  makeKeySpeller,
  scoreEndBeat,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  Sonata,
  useCursorApi,
  useSonata,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useInertialDrag } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/web";
import { keyLayout as fractionalKeyLayout } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  blackKeyColor,
  useTrackColorMap,
  useHiddenTrackIds,
} from "@plugins/apps/plugins/sonata/plugins/track-mixer/web";
import { pianoRollConfig } from "../../shared/config";
import {
  authoredSecondsOf,
  buildNoteVisuals,
  buildProjection,
  KEYBOARD_HIGH,
  KEYBOARD_LOW,
  PX_PER_SECOND,
  SPREAD_MIN,
} from "./geometry";
import type { Application } from "pixi.js";
import { PianoRollCanvas } from "../internal/pixi/app";
import type { PianoRollScene } from "../internal/pixi/scene";
import { createFxContext } from "../internal/fx/fx-context";
import { FxHost } from "../internal/fx/fx-host";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";
import { TransportOverlayHost } from "./transport-overlay-host";
import { FxToggle } from "./fx-toggle";
import { ViewOptionsToggle } from "./view-options-toggle";
import { PitchAxisHost } from "./pitch-axis-host";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. The
 *  playback cursor is NOT a prop — it's read from the cursor store imperatively
 *  (see `applyCursor`) so a per-frame advance never re-renders this display. */
export interface PianoRollProps {
  score: Score;
  /** Playback tempo multiplier (1 = authored). Scales the scroll rate so slowing
   *  the tempo slows the scroll instead of stretching note heights. */
  tempoScale: number;
  activeDisplayId: string;
}

/** Height of the pitch-axis gutter (the piano keyboard) at the bottom. */
const KEYBOARD_HEIGHT = 112;

/**
 * Fixed Synthesia-dark lane background. Deliberately theme-independent (not a
 * `bg-background` token): the falling-notes roll is a dark "stage" in every
 * theme, so the opaque note colors read exactly as Synthesia's, light or dark.
 */
const ROLL_BG = "#262626";

/**
 * Wheel-zoom sensitivity: spread is multiplied by `exp(-deltaY * k)` per wheel
 * event, so a Ctrl+scroll UP (deltaY < 0) zooms in and DOWN zooms out — the
 * browser-zoom convention — multiplicatively (scale-free, smooth) and
 * direction-symmetric. Tuned so a ~100px notch is ≈15% and a trackpad pinch's
 * small deltas are a gentle, continuous drift.
 */
const ZOOM_WHEEL_K = 0.0015;

/** After the wheel goes quiet this long, a zoom commits to the global config and
 *  a wheel-paused playback resumes — mirroring the drag's resume-on-settle. */
const WHEEL_IDLE_MS = 180;

/** Headroom left when computing the "fit the whole song" zoom-out floor: the song
 *  fills ~92% of the lane at max zoom-out, leaving a small gap above it. */
const FIT_MARGIN = 0.92;

/**
 * The cursor scroll layer: one `translateY` over the cursor-INVARIANT overlay
 * content, mirroring the canvas scene's `setScroll` so DOM overlays and canvas
 * notes stay glued per frame. The transform is written IMPERATIVELY by the
 * parent's cursor subscription (see `applyCursor`) via this forwarded ref — the
 * component never reads the cursor, so a per-frame advance touches one
 * `style.transform` and triggers ZERO React renders.
 *
 * Its `children` are the cursor-INVARIANT content (the projection-anchored
 * overlay host), memoized by the parent so their element identity is stable
 * between frames.
 *
 * `transform` opens a new stacking context here, so the now-line must remain a
 * sibling OUTSIDE this layer to render above it.
 */
const ScrollLayer = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  function ScrollLayer({ children }, ref) {
    return (
      // eslint-disable-next-line layout/no-adhoc-layout -- imperatively transformed scroll layer: the parent's cursor subscription writes translateY per frame (see applyCursor); full-bleed positioning context for the projection-anchored overlays
      <div ref={ref} className="absolute inset-0">
        {children}
      </div>
    );
  },
);

function PianoRollInner({ score, tempoScale }: PianoRollProps) {
  // Imperative per-surface cursor facade. Stable (memoized on the store), so the
  // subscription/scroll closures below never go stale and can list it in deps.
  const cursor = useCursorApi();

  // We measure the LANE (above the keyboard); its height drives the time axis.
  // `useElementSize` hands back a callback ref; we also mirror the node into
  // state so the native wheel listener below can attach to the live element
  // (the size hook owns measurement, but doesn't expose the node).
  const [sizeRef, lane] = useElementSize<HTMLDivElement>();
  const [laneEl, setLaneEl] = useState<HTMLDivElement | null>(null);
  const laneRef = useCallback(
    (node: HTMLDivElement | null) => {
      sizeRef(node);
      setLaneEl(node);
    },
    [sizeRef],
  );

  // Synthesia-style note-name labels (opt-in). Spelling follows the score's key
  // signature so accidentals read in-key (Eb vs D#), matching the keyboard below.
  // `spread` is the persisted GLOBAL vertical-zoom default; the live value is
  // ephemeral transport state (`useSonata().spread`) the toolbar wheel + pinch/
  // scroll gestures drive.
  const { showNoteNames, spread: persistedSpread } = useConfig(pianoRollConfig);
  const setConfig = useSetConfig(pianoRollConfig);
  const { spread, setSpread, setSpreadFloor, seekTo, isPlaying, play, stop } =
    useSonata();

  // Seed the live zoom from the persisted global on load (and reflect a
  // Settings-pane edit live). No loop: only an explicit commit (wheel settle /
  // pinch idle) writes the config, and never during a drag — so post-commit the
  // persisted value already equals the live one and this re-seed is a no-op.
  useLayoutEffect(() => {
    setSpread(persistedSpread);
  }, [persistedSpread, setSpread]);

  const speller = useMemo(
    () => makeKeySpeller(score.meta.key),
    [score.meta.key],
  );

  // Cursor-invariant projection: depends only on lane size + score, so it (and
  // every overlay anchor) stays stable while playing — only the ScrollLayer
  // moves. The canvas draws from the SAME geometry source (buildNoteVisuals
  // shares the fractional key layout and authored-seconds axis), so canvas
  // notes land pixel-exact with DOM overlays and the keyboard.
  const projection = useMemo(
    () =>
      buildProjection({
        width: lane.width,
        height: lane.height,
        score,
        tempoScale,
        spread,
      }),
    [lane.width, lane.height, score, tempoScale, spread],
  );

  // Tempo index, built once per score and reused by the ScrollLayer so it is
  // not rebuilt every frame (the projection already built its own internally).
  const tempo = useMemo(() => buildTempoIndex(score), [score]);

  // --- Drag-to-scrub with momentum: the lane behaves like a movable surface. --
  // Grabbing the roll and dragging maps pointer travel 1:1 onto the scroll
  // offset, so the content follows the finger: drag DOWN advances time (future
  // notes fall toward the now-line), drag UP rewinds. A flick on release coasts
  // under exponential friction and settles. We drive the shared absolute
  // `seekTo`, the same primitive the progression-bar scrubber uses, so audio +
  // cursor stay glued. The offset's time term is
  // `seconds(cursor) * PX_PER_SECOND * tempoScale * spread`, so a 1-pixel drag
  // equals `1 / (PX_PER_SECOND * tempoScale * spread)` authored-seconds of
  // travel — hence `unitsPerPixel` (zoom in ⇒ a pixel covers less time). The
  // physics (friction, momentum) lives in the reusable inertial-drag primitive;
  // this site only maps pixels↔seconds and bridges the transport (pause on grab,
  // restore the pre-drag play state once motion ends). (`seekTo`/`isPlaying`/
  // `play`/`stop` come from the single `useSonata()` destructure above.)
  const hasNotes = score.notes.length > 0;
  const pxPerSecond = PX_PER_SECOND * tempoScale * spread;
  const endSeconds = tempo.beatToSeconds(scoreEndBeat(score));
  const wasPlaying = useRef(false);

  // Let the user zoom OUT until the whole song fits the lane. The song's on-screen
  // pixel height is `endSeconds * PX_PER_SECOND * tempoScale * spread` (the same
  // term the scroll offset uses), so the spread that makes it exactly fill the
  // lane is `laneHeight / (endSeconds * PX_PER_SECOND * tempoScale)`. We hand a
  // touch-smaller value (FIT_MARGIN headroom) to the context as the dynamic
  // zoom-out floor; the context caps it at the default floor so short songs (which
  // already fit far above it) are unaffected. Recomputes on lane resize / tempo.
  const spreadFloor = useMemo(() => {
    if (!hasNotes || lane.height <= 0 || endSeconds <= 0) return SPREAD_MIN;
    const fit = lane.height / (endSeconds * PX_PER_SECOND * tempoScale);
    return Math.min(SPREAD_MIN, fit * FIT_MARGIN);
  }, [hasNotes, lane.height, endSeconds, tempoScale]);
  useEffect(() => {
    setSpreadFloor(spreadFloor);
  }, [spreadFloor, setSpreadFloor]);

  const { handlers, phase } = useInertialDrag({
    axis: "y",
    unitsPerPixel: 1 / pxPerSecond,
    bounds: [0, endSeconds],
    origin: () => tempo.beatToSeconds(cursor.getBeat()),
    onScrub: (sec) => seekTo(tempo.secondsToBeat(sec)),
    onGrab: () => {
      if (isPlaying) {
        wasPlaying.current = true;
        stop();
      }
    },
    onSettle: () => {
      if (wasPlaying.current) {
        wasPlaying.current = false;
        play();
      }
    },
  });

  // Per-track view-state: hidden tracks are dropped from the roll entirely;
  // every drawn note is tinted by its track's effective color (palette default
  // or user override). Both come from the track-mixer's reactive rollup, so a
  // toggle/recolor re-derives the visuals (and only then — not per frame).
  const colorMap = useTrackColorMap();
  const hiddenIds = useHiddenTrackIds();

  // Authored-space note visuals — the canvas renderer's entire input. Pure and
  // CURSOR-INVARIANT: built once per (score, track view, tempoScale); resize
  // and scroll never touch it (the scene maps it to pixels with one transform).
  const visuals = useMemo(
    () =>
      buildNoteVisuals({
        score,
        hiddenIds,
        colorMap,
        blackKeyColor,
        speller,
        tempoScale,
      }),
    [score, hiddenIds, colorMap, speller, tempoScale],
  );

  // Bar markers in authored seconds (the canvas grid + bar numbers' input).
  const barMarkers = useMemo(
    () =>
      bars(score).map((b) => ({
        index: b.index,
        startSec: authoredSecondsOf(tempo, tempoScale, b.startBeat),
      })),
    [score, tempo, tempoScale],
  );

  // Pitch-axis separators at the two natural white-key boundaries (where
  // adjacent white keys have no black key between them): the B–C octave split
  // (left edge of every C, pitch class 0) rendered STRONG, and the E–F
  // mid-octave split (left edge of every F, pitch class 5) rendered regular.
  // Taken from the SAME fractional layout the notes use, so each line sits
  // exactly on its key edge.
  const pitchLines = useMemo(
    () =>
      fractionalKeyLayout(KEYBOARD_LOW, KEYBOARD_HIGH)
        .map((k) => ({ pc: ((k.pitch % 12) + 12) % 12, k }))
        .filter(({ pc }) => pc === 0 || pc === 5)
        .map(({ pc, k }) => ({ frac: k.center - k.width / 2, strong: pc === 0 })),
    [],
  );

  // Live scene + app pair, published by the canvas once Pixi init settles.
  // The FX context (and host) mount off it below.
  const [pixi, setPixi] = useState<{
    scene: PianoRollScene;
    app: Application;
  } | null>(null);

  // Bumped when the canvas reports a spontaneous GPU context/device loss; used
  // as the canvas's React `key` so a loss fully remounts it — a clean teardown
  // of the dead Pixi app and a rebuild from the current props. Pixi v8 does not
  // recover from a spontaneous loss itself (see app.tsx watchContextLoss), so on
  // a long-lived tab a sleep/wake would otherwise blank the notes forever while
  // the DOM chords/keyboard kept rendering.
  const [canvasNonce, setCanvasNonce] = useState(0);
  const handleContextLost = useCallback(() => setCanvasNonce((n) => n + 1), []);

  // Latest-geometry refs for the FX context. The context is identity-stable
  // (memoized on the pixi pair only) so effects never remount on resize —
  // instead its accessors read these refs, which mirror the freshest
  // projection/lane values every render. Closing over `projection` directly
  // would hand effects a stale snapshot after the first resize.
  const projectionRef = useLatestRef(projection);
  const laneSizeRef = useLatestRef(lane);

  // FX bridge — one per scene. See fx-context.ts for the accessor/budget design.
  const fx = useMemo(
    () =>
      pixi
        ? // eslint-disable-next-line react-hooks/refs -- the refs are captured into deferred accessor closures (getProjection/getLaneSize), NEVER read during this render; they're read later when an FX effect calls the accessor, so the context stays identity-stable across resize.
          createFxContext({
            scene: pixi.scene,
            app: pixi.app,
            getProjection: () => projectionRef.current,
            getLaneSize: () => laneSizeRef.current,
            // The shared playback cursor — the clock note-anchored effects read
            // so their geometry stays a pure function of the cursor (glued to
            // the notes on pause/scrub) instead of integrating wall-clock.
            getPlaybackBeats: () => cursor.getBeat(),
          })
        : null,
    [pixi, cursor],
  );

  // --- Imperative cursor path. The playhead advances ~60fps via the cursor
  // store; routing it through React would re-render this whole display every
  // frame. Instead a single subscription pushes the cursor straight to the Pixi
  // scene (`setScroll`) and the DOM scroll layer's `transform`, reading the
  // latest geometry from refs — so a frame is two imperative writes and ZERO
  // React renders. This component re-renders only on real input changes (score,
  // lane size, tempo, track view).
  const scrollLayerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useLatestRef(pixi?.scene ?? null);
  const tempoRef = useLatestRef(tempo);
  const tempoScaleRef = useLatestRef(tempoScale);
  // Live zoom, read imperatively by the per-frame DOM offset and the wheel
  // handler (which must not re-attach on every zoom tick).
  const spreadRef = useLatestRef(spread);
  // Play state read imperatively by the wheel-seek pause/resume bridge.
  const isPlayingRef = useLatestRef(isPlaying);

  const applyCursor = useCallback((beat: number, seek = false) => {
    const scene = sceneRef.current;
    const tempo = tempoRef.current;
    const ts = tempoScaleRef.current;
    // A seek/jump (scrub, seek, score reset) must re-anchor the onset tracker
    // instead of advancing through every note between the old and new position
    // — navigation must not spray note-strike FX. `reset()` defers the re-anchor
    // to the setScroll just below, which carries the post-seek cursor.
    if (seek) scene?.reset();
    // Canvas: one O(1) container move in authored seconds.
    scene?.setScroll(authoredSecondsOf(tempo, ts, beat), beat);
    // DOM overlays: the same lane-bottom offset the scene applies to its scroll
    // root, so overlays and canvas notes stay glued. `PX_PER_SECOND * ts *
    // spread` mirrors the geometry's effective pixels-per-second, so a slower
    // tempo scrolls slower and a higher zoom spreads the overlays in lockstep.
    const el = scrollLayerRef.current;
    if (el) {
      const offset =
        laneSizeRef.current.height +
        tempo.beatToSeconds(beat) * PX_PER_SECOND * ts * spreadRef.current;
      el.style.transform = `translateY(${offset}px)`;
    }
  }, []);

  // Drive the imperative path on every cursor change — no React render. The
  // store tells us whether the change was a seek so we re-anchor onsets.
  useEffect(
    () => cursor.subscribe((seek) => applyCursor(cursor.getBeat(), seek)),
    [applyCursor, cursor],
  );

  // --- Wheel gestures on the lane: plain scroll SEEKS, pinch / Ctrl+scroll
  // ZOOMS. A native non-passive listener (React's onWheel is passive and can't
  // preventDefault) so the page never scrolls under the gesture. Live zoom +
  // play-state are read from refs so a 60fps gesture never re-attaches.
  useEffect(() => {
    const el = laneEl;
    if (!el || !hasNotes) return;

    let idle: number | null = null;
    let pausedByWheel = false;
    let zoomed = false;
    const settle = () => {
      idle = null;
      // Commit the zoom to the global default and resume any wheel-paused play.
      // A sub-default fit-zoom is a transient per-song view, NOT a saved note-size
      // preference, so it is never persisted globally (that would shrink the next
      // song too) — only in-range zooms write back.
      if (zoomed) {
        zoomed = false;
        if (spreadRef.current >= SPREAD_MIN) setConfig("spread", spreadRef.current);
      }
      if (pausedByWheel) {
        pausedByWheel = false;
        play();
      }
    };
    const bumpIdle = () => {
      if (idle !== null) window.clearTimeout(idle);
      idle = window.setTimeout(settle, WHEEL_IDLE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Pinch / Ctrl+scroll → multiplicative zoom (context clamps the range).
        zoomed = true;
        setSpread(spreadRef.current * Math.exp(-e.deltaY * ZOOM_WHEEL_K));
      } else {
        // Plain scroll → seek. Map wheel pixels to authored-seconds with the
        // SAME px/sec the drag uses (down/forward), then drive shared `seekTo`.
        if (isPlayingRef.current && !pausedByWheel) {
          pausedByWheel = true;
          stop();
        }
        const perPx = 1 / (PX_PER_SECOND * tempoScale * spreadRef.current);
        const cur = tempo.beatToSeconds(cursor.getBeat());
        const next = Math.max(0, Math.min(endSeconds, cur + e.deltaY * perPx));
        seekTo(tempo.secondsToBeat(next));
      }
      bumpIdle();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (idle !== null) window.clearTimeout(idle);
    };
  }, [
    laneEl,
    hasNotes,
    cursor,
    tempo,
    endSeconds,
    tempoScale,
    seekTo,
    setSpread,
    setConfig,
    play,
    stop,
  ]);

  // Re-sync after any reactive change (scene ready, resize, tempo, zoom) and on
  // mount, so the view lands correctly even while paused (no cursor tick fires
  // then). A spread change resizes the content in place, so the DOM offset must
  // be re-applied here in lockstep with the scene's own rescale (app.tsx).
  // Layout effect so the transform is applied before paint (no flash).
  useLayoutEffect(() => {
    applyCursor(cursor.getBeat());
  }, [applyCursor, cursor, pixi, lane.height, tempo, tempoScale, spread]);

  // The cursor-invariant DOM content, MEMOIZED on its real inputs. The overlay
  // subtree's element identity stays stable between frames (this component no
  // longer re-renders per frame at all — the cursor drives the imperative path
  // above), so React never reconciles it during playback.
  const content = useMemo(
    () => (
      <ProjectionProvider projection={projection}>
        <OverlayHost score={score} />
        <TransportOverlayHost />
      </ProjectionProvider>
    ),
    [projection, score],
  );

  return (
    <Stack gap="none" className="h-full w-full bg-background">
      {/* The note lane. Notes, grid, and labels render on the Pixi canvas in
          cursor-invariant authored space; DOM keeps the overlays, now-line,
          HUD, and keyboard. Pitch is the fixed full keyboard across the width,
          so canvas notes align column-for-key with the keyboard below. */}
      <Clip
        fill
        ref={laneRef}
        {...(hasNotes ? handlers : null)}
        style={{ backgroundColor: ROLL_BG }}
        className={cn(
          "relative touch-none select-none",
          hasNotes
            ? phase === "idle"
              ? "cursor-grab"
              : "cursor-grabbing"
            : null,
        )}
      >
        {/* The GPU note lane: grid, falling notes, and labels — under every
            DOM layer (transparent canvas; the lane bg shows through). */}
        <PianoRollCanvas
          key={canvasNonce}
          width={lane.width}
          height={lane.height}
          visuals={visuals}
          bars={barMarkers}
          pitchLines={pitchLines}
          scoreNotes={score.notes}
          showLabels={showNoteNames}
          tempoScale={tempoScale}
          spread={spread}
          onSceneReady={setPixi}
          onContextLost={handleContextLost}
        />

        {/* Headless FX wiring — every PianoRollFx contribution, config-gated
            and error-isolated. Renders no DOM; effects paint into the scene's
            fx layers via the context. */}
        {fx ? <FxHost fx={fx} /> : null}

        <ScrollLayer ref={scrollLayerRef}>{content}</ScrollLayer>

        {/* Playback now-line: where falling notes land on the keyboard. Screen-
            anchored, so it sits OUTSIDE the scroll layer (and above it). */}
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- now-line position is JS-computed from the measured lane size (top/width come from the ResizeObserver)
          className="pointer-events-none absolute left-0 z-raised h-0.5 bg-primary"
          style={{ top: lane.height, width: lane.width }}
        />

        {/* HUD: screen-anchored heads-up chips (current key, …) pinned to the
            lane's top-right corner — above the scroll layer and now-line, clear
            of the chord overlay that hugs the left edge. Contributors read the
            shared cursor via useSonata(); collection-consumer clean (renders the
            generic Sonata.Hud slot, never naming a contributor). */}
        <Pin to="top-right" offset="sm" layer="float" decorative>
          <Stack gap="xs" align="end">
            <Sonata.Hud.Render>
              {(h) => <h.component key={h.id} />}
            </Sonata.Hud.Render>
            {/* Host-owned FX + display-options popovers — sit with the HUD
                chips; re-enable their own pointer events (the cluster is
                pointer-events-none). */}
            <ViewOptionsToggle />
            <FxToggle />
          </Stack>
        </Pin>

        {/* Empty-score affordance. */}
        {score.notes.length === 0 ? (
          // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed positioning context layered over the lane (sibling of the canvas/scroll layers); centers the empty-state message
          <div className="pointer-events-none absolute inset-0">
            <Center className="h-full w-full">
              <Text as="span" variant="body" className="text-muted-foreground">
                No notes to display. Load a source to see the piano roll.
              </Text>
            </Center>
          </div>
        ) : null}
      </Clip>

      {/* Pitch-axis gutter: the piano keyboard (and any future pitch-axis
          decorations) contributed via `Sonata.PitchAxis`. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- rigid footer edge of the column (fixed keyboard height); Stack has no per-child shrink-0 role and the body is a canvas Clip, not a Scroll, so Column doesn't fit
        className="relative shrink-0 border-t border-border"
        style={{ height: KEYBOARD_HEIGHT }}
      >
        <PitchAxisHost projection={projection} />
      </div>
    </Stack>
  );
}

/**
 * The piano-roll Display. Renders notes Synthesia-style on a time (vertical) ×
 * pitch (horizontal full-keyboard) grid that falls toward a piano keyboard at
 * the bottom — notes/grid/labels on a PixiJS canvas (WebGPU-first, WebGL
 * fallback), chrome and overlays in DOM. Publishes a `Projection` (both
 * capabilities) and hosts capability-compatible overlays (over the lane) and
 * pitch-axis decorations (in the gutter).
 */
export function PianoRoll(props: PianoRollProps) {
  return <PianoRollInner {...props} />;
}
