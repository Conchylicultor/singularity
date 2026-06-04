import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bars,
  buildTempoIndex,
  type Score,
  type TempoIndex,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { buildProjection, PX_PER_SECOND } from "./geometry";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";
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
 * Bar lines, drawn as absolutely-positioned content-space elements. These live
 * INSIDE the scroll layer, so their `top` is the cursor-invariant content Y and
 * the layer's `translateY` scrolls them. All bars mount once — the lane's
 * `overflow-hidden` paint-culls whatever falls offscreen.
 */
function GridLines({
  score,
  beatToY,
  laneWidth,
}: {
  score: Score;
  beatToY: (beat: number) => number;
  laneWidth: number;
}) {
  const barList = useMemo(() => bars(score), [score]);

  return (
    <>
      {barList.map((b) => (
        <div
          key={b.index}
          className="absolute left-0 border-t border-border/60"
          style={{ top: beatToY(b.startBeat), width: laneWidth }}
        >
          <span className="absolute left-1 top-0.5 select-none text-[10px] tabular-nums text-muted-foreground/70">
            {b.index + 1}
          </span>
        </div>
      ))}
    </>
  );
}

/**
 * The ONLY component that reads `cursorBeat` each frame. It maps the cursor to a
 * single scroll `offset` and applies it as one `translateY` over its children.
 *
 * Its `children` are the cursor-INVARIANT content (notes + bar lines + overlays),
 * created by the parent which does NOT depend on `cursorBeat`. Because those
 * element identities don't change between frames, React bails out re-rendering
 * them when only the cursor advances — so the whole notes/overlay subtree stops
 * reconciling and only this leaf's transform updates. Keeping the parent
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

  // Cursor-invariant projection: depends only on lane size + score, so it (and
  // every note rect) stays stable while playing — only the ScrollLayer moves.
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

  // Note rectangles, derived from the projection (single geometry source).
  const noteRects = useMemo(() => {
    const toRect = projection.noteToRect!;
    return score.notes.map((n) => ({ note: n, rect: toRect(n) }));
  }, [projection, score.notes]);

  // The cursor-invariant content. Built here (cursor-free) so its element
  // identity is stable across frames; passed as `children` to ScrollLayer.
  const content = (
    <>
      <GridLines
        score={score}
        beatToY={projection.beatToY!}
        laneWidth={lane.width}
      />

      {noteRects.map(({ note, rect }) => (
        <div
          key={note.id}
          className={cn(
            "absolute z-10 rounded-sm border border-primary/40 bg-primary/70 shadow-sm",
          )}
          style={{
            left: rect.x,
            top: rect.y,
            width: Math.max(2, rect.w - 1),
            height: Math.max(2, rect.h - 1),
            opacity: 0.4 + (note.velocity / 127) * 0.6,
          }}
          title={`pitch ${note.pitch} · beat ${note.start.toFixed(2)}`}
        />
      ))}

      {/* Overlays anchor against the published projection. */}
      <ProjectionProvider projection={projection}>
        <OverlayHost score={score} />
      </ProjectionProvider>
    </>
  );

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* The note lane. Content lives in cursor-invariant content-space; the
          ScrollLayer applies the per-frame scroll as one translateY. Pitch is
          the fixed full keyboard across the width, so notes align
          column-for-key with the keyboard below. */}
      <div ref={laneRef} className="relative min-h-0 flex-1 overflow-hidden">
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
          className="pointer-events-none absolute left-0 z-20 h-0.5 bg-primary"
          style={{ top: lane.height, width: lane.width }}
        />

        {/* Empty-score affordance. */}
        {score.notes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              No notes to display. Load a source to see the piano roll.
            </span>
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
 * the bottom. Publishes a `Projection` (both capabilities) and hosts capability-
 * compatible overlays (over the lane) and pitch-axis decorations (in the gutter).
 */
export function PianoRoll(props: PianoRollProps) {
  return <PianoRollInner {...props} />;
}
