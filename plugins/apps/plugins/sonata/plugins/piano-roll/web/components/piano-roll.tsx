import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  bars,
  buildTempoIndex,
  makeKeySpeller,
  scoreEndBeat,
  type Score,
  type TempoIndex,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useConfig } from "@plugins/config_v2/web";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useInertialDrag } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/inertial-drag/web";
import { keyLayout as fractionalKeyLayout } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
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
} from "./geometry";
import type { Application } from "pixi.js";
import { PianoRollCanvas } from "../internal/pixi/app";
import type { PianoRollScene } from "../internal/pixi/scene";
import { createFxContext } from "../internal/fx/fx-context";
import { FxHost } from "../internal/fx/fx-host";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";
import { FxToggle } from "./fx-toggle";
import { PitchAxisHost } from "./pitch-axis-host";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. */
export interface PianoRollProps {
  score: Score;
  cursorBeat: number;
  /** Playback tempo multiplier (1 = authored). Scales the scroll rate so slowing
   *  the tempo slows the scroll instead of stretching note heights. */
  tempoScale: number;
  activeDisplayId: string;
}

/** Height of the pitch-axis gutter (the piano keyboard) at the bottom. */
const KEYBOARD_HEIGHT = 112;

/** Observe an element's pixel size via ResizeObserver (no polling). */
function useElementSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number },
] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * The ONLY DOM component that reads `cursorBeat` each frame. It maps the cursor
 * to a single scroll `offset` and applies it as one `translateY` over its
 * children — exactly the formula the canvas scene's `setScroll` applies to its
 * scroll root, so DOM overlays and canvas notes stay glued per frame.
 *
 * Its `children` are the cursor-INVARIANT content (the projection-anchored
 * overlay host), created by the parent which does NOT depend on `cursorBeat`.
 * Because those element identities don't change between frames, React bails
 * out re-rendering them when only the cursor advances. Keeping the parent
 * cursor-free is load-bearing: if it read `cursorBeat`, the isolation breaks.
 *
 * `transform` opens a new stacking context here, so the now-line must remain a
 * sibling OUTSIDE this layer to render above it.
 */
function ScrollLayer({
  cursorBeat,
  laneHeight,
  tempo,
  tempoScale,
  children,
}: {
  cursorBeat: number;
  laneHeight: number;
  tempo: TempoIndex;
  tempoScale: number;
  children: React.ReactNode;
}) {
  // Map the cursor to the lane bottom: offset = height + seconds(cursor)*pxPerSec.
  // This is exactly the per-frame term factored out of the old screen-space
  // beatToY, applied once to the whole content layer. `pxPerSecond` mirrors the
  // geometry's `PX_PER_SECOND * tempoScale`, so a slower tempo scrolls slower.
  const offset =
    laneHeight + tempo.beatToSeconds(cursorBeat) * PX_PER_SECOND * tempoScale;
  return (
    <div
      className="absolute inset-0"
      style={{ transform: `translateY(${offset}px)` }}
    >
      {children}
    </div>
  );
}

function PianoRollInner({ score, cursorBeat, tempoScale }: PianoRollProps) {
  // We measure the LANE (above the keyboard); its height drives the time axis.
  const [laneRef, lane] = useElementSize();

  // Synthesia-style note-name labels (opt-in). Spelling follows the score's key
  // signature so accidentals read in-key (Eb vs D#), matching the keyboard below.
  const { showNoteNames } = useConfig(pianoRollConfig);
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
      }),
    [lane.width, lane.height, score, tempoScale],
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
  // `seconds(cursor) * PX_PER_SECOND * tempoScale`, so a 1-pixel drag equals
  // `1 / (PX_PER_SECOND * tempoScale)` authored-seconds of travel — hence
  // `unitsPerPixel`. The physics (friction, momentum) lives in the reusable
  // inertial-drag primitive; this site only maps pixels↔seconds and bridges the
  // transport (pause on grab, restore the pre-drag play state once motion ends).
  const { seekTo, isPlaying, play, stop, seekEpoch } = useSonata();
  const hasNotes = score.notes.length > 0;
  const pxPerSecond = PX_PER_SECOND * tempoScale;
  const endSeconds = tempo.beatToSeconds(scoreEndBeat(score));
  const wasPlaying = useRef(false);

  const { handlers, phase } = useInertialDrag({
    axis: "y",
    unitsPerPixel: 1 / pxPerSecond,
    bounds: [0, endSeconds],
    origin: () => tempo.beatToSeconds(cursorBeat),
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
    () => buildNoteVisuals({ score, hiddenIds, colorMap, speller, tempoScale }),
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

  // Octave separators: the left-edge fraction of every C key, from the SAME
  // fractional layout the notes use, so each line sits exactly on its key edge.
  const cBoundaryFracs = useMemo(
    () =>
      fractionalKeyLayout(KEYBOARD_LOW, KEYBOARD_HIGH)
        .filter((k) => ((k.pitch % 12) + 12) % 12 === 0)
        .map((k) => k.center - k.width / 2),
    [],
  );

  // Live scene + app pair, published by the canvas once Pixi init settles.
  // The FX context (and host) mount off it below.
  const [pixi, setPixi] = useState<{
    scene: PianoRollScene;
    app: Application;
  } | null>(null);

  // Latest-geometry refs for the FX context. The context is identity-stable
  // (memoized on the pixi pair only) so effects never remount on resize —
  // instead its accessors read these refs, which mirror the freshest
  // projection/lane values every render. Closing over `projection` directly
  // would hand effects a stale snapshot after the first resize.
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const laneSizeRef = useRef(lane);
  laneSizeRef.current = lane;

  // FX bridge — one per scene. See fx-context.ts for the accessor/budget design.
  const fx = useMemo(
    () =>
      pixi
        ? createFxContext({
            scene: pixi.scene,
            app: pixi.app,
            getProjection: () => projectionRef.current,
            getLaneSize: () => laneSizeRef.current,
          })
        : null,
    [pixi],
  );

  // Per-frame scroll position in AUTHORED seconds — the only cursor-derived
  // value the canvas consumes (one O(1) container move per frame).
  const scrollSec = authoredSecondsOf(tempo, tempoScale, cursorBeat);

  // The cursor-invariant DOM content, MEMOIZED on its real inputs — pointedly
  // NOT on `cursorBeat`. The transport bumps the cursor every rAF frame, which
  // re-renders this component (it reads the shared context via `useSonata`);
  // memoizing keeps the overlay subtree's element identity stable between
  // cursor frames so React bails out of reconciling it and only `ScrollLayer`'s
  // single `translateY` (and the canvas scene's O(1) setScroll) update.
  const content = useMemo(
    () => (
      <ProjectionProvider projection={projection}>
        <OverlayHost score={score} />
      </ProjectionProvider>
    ),
    [projection, score],
  );

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* The note lane. Notes, grid, and labels render on the Pixi canvas in
          cursor-invariant authored space; DOM keeps the overlays, now-line,
          HUD, and keyboard. Pitch is the fixed full keyboard across the width,
          so canvas notes align column-for-key with the keyboard below. */}
      <div
        ref={laneRef}
        {...(hasNotes ? handlers : null)}
        className={cn(
          "relative min-h-0 flex-1 touch-none select-none overflow-hidden",
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
          width={lane.width}
          height={lane.height}
          visuals={visuals}
          bars={barMarkers}
          cBoundaryFracs={cBoundaryFracs}
          scoreNotes={score.notes}
          scrollSec={scrollSec}
          cursorBeat={cursorBeat}
          seekEpoch={seekEpoch}
          showLabels={showNoteNames}
          tempoScale={tempoScale}
          onSceneReady={setPixi}
        />

        {/* Headless FX wiring — every PianoRollFx contribution, config-gated
            and error-isolated. Renders no DOM; effects paint into the scene's
            fx layers via the context. */}
        {fx ? <FxHost fx={fx} /> : null}

        <ScrollLayer
          cursorBeat={cursorBeat}
          laneHeight={lane.height}
          tempo={tempo}
          tempoScale={tempoScale}
        >
          {content}
        </ScrollLayer>

        {/* Playback now-line: where falling notes land on the keyboard. Screen-
            anchored, so it sits OUTSIDE the scroll layer (and above it). */}
        <div
          className="pointer-events-none absolute left-0 z-raised h-0.5 bg-primary"
          style={{ top: lane.height, width: lane.width }}
        />

        {/* HUD: screen-anchored heads-up chips (current key, …) pinned to the
            lane's top-right corner — above the scroll layer and now-line, clear
            of the chord overlay that hugs the left edge. Contributors read the
            shared cursor via useSonata(); collection-consumer clean (renders the
            generic Sonata.Hud slot, never naming a contributor). */}
        <div className="pointer-events-none absolute right-2 top-2 z-float flex flex-col items-end gap-xs">
          <Sonata.Hud.Render>
            {(h) => <h.component key={h.id} />}
          </Sonata.Hud.Render>
          {/* Host-owned FX popover — sits with the HUD chips; re-enables its
              own pointer events (the cluster is pointer-events-none). */}
          <FxToggle />
        </div>

        {/* Empty-score affordance. */}
        {score.notes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Text as="span" variant="body" className="text-muted-foreground">
              No notes to display. Load a source to see the piano roll.
            </Text>
          </div>
        ) : null}
      </div>

      {/* Pitch-axis gutter: the piano keyboard (and any future pitch-axis
          decorations) contributed via `Sonata.PitchAxis`. */}
      <div
        className="relative shrink-0 border-t border-border"
        style={{ height: KEYBOARD_HEIGHT }}
      >
        <PitchAxisHost projection={projection} />
      </div>
    </div>
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
