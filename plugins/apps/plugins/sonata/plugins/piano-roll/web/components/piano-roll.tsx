import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bars,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  buildProjection,
  pitchRange,
  planeHeight,
  PX_PER_BEAT,
  type PitchRange,
} from "./geometry";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. */
export interface PianoRollProps {
  score: Score;
  cursorBeat: number;
  activeDisplayId: string;
}

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
 * Keep the playback cursor in view by scrolling the time axis. The cursor is
 * pinned to a fixed fraction of the viewport width (`CURSOR_ANCHOR_FRAC`); the
 * leftmost visible beat is derived purely from `cursorBeat`, so layout is a pure
 * function of props — no per-frame React state, no animation thrash.
 */
const CURSOR_ANCHOR_FRAC = 0.35;
function scrollBeatFor(cursorBeat: number, viewportWidth: number): number {
  if (viewportWidth <= 0) return 0;
  const anchorPx = viewportWidth * CURSOR_ANCHOR_FRAC;
  const anchorBeats = anchorPx / PX_PER_BEAT;
  // Never scroll past the origin (no negative beats on screen at the start).
  return Math.max(0, cursorBeat - anchorBeats);
}

/** Bar lines + cursor, drawn as absolutely-positioned elements over the grid. */
function GridLines({
  score,
  range,
  scrollBeat,
  viewportWidth,
  cursorBeat,
}: {
  score: Score;
  range: PitchRange;
  scrollBeat: number;
  viewportWidth: number;
  cursorBeat: number;
}) {
  const height = planeHeight(range);
  const beatToX = (beat: number) => (beat - scrollBeat) * PX_PER_BEAT;

  const barList = useMemo(() => bars(score), [score]);
  // Only render bar lines that fall within the visible window (+margin).
  const visibleBars = barList.filter((b) => {
    const x = beatToX(b.startBeat);
    return x >= -PX_PER_BEAT && x <= viewportWidth + PX_PER_BEAT;
  });

  const cursorX = beatToX(cursorBeat);

  return (
    <>
      {visibleBars.map((b) => (
        <div
          key={b.index}
          className="absolute top-0 border-l border-border/60"
          style={{ left: beatToX(b.startBeat), height }}
        >
          <span className="absolute left-1 top-0 select-none text-[10px] tabular-nums text-muted-foreground/70">
            {b.index + 1}
          </span>
        </div>
      ))}
      {/* Playback cursor. */}
      <div
        className="pointer-events-none absolute top-0 z-20 w-0.5 bg-primary"
        style={{ left: cursorX, height }}
      />
    </>
  );
}

function PianoRollInner({ score, cursorBeat }: PianoRollProps) {
  const [containerRef, size] = useElementSize();

  const range = useMemo(() => pitchRange(score), [score]);
  const scrollBeat = scrollBeatFor(cursorBeat, size.width);

  const viewport = useMemo(
    () => ({ width: size.width, height: size.height, scrollBeat }),
    [size.width, size.height, scrollBeat],
  );

  const projection = useMemo(
    () => buildProjection(range, viewport),
    [range, viewport],
  );

  const height = planeHeight(range);

  // Note rectangles, derived from the projection (single geometry source).
  const noteRects = useMemo(() => {
    const toRect = projection.noteToRect!;
    return score.notes.map((n) => ({ note: n, rect: toRect(n) }));
  }, [projection, score.notes]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-x-hidden overflow-y-auto bg-background"
    >
      {/* The plane. Its height is the full pitch span (vertical scroll for tall
          files); horizontal scroll is VIRTUAL — we translate via `scrollBeat`,
          so only visible notes paint and overlays share the same origin. The
          projection's pixel coordinates are relative to THIS plane's top-left. */}
      <div className="relative w-full" style={{ height }}>
        <GridLines
          score={score}
          range={range}
          scrollBeat={scrollBeat}
          viewportWidth={size.width}
          cursorBeat={cursorBeat}
        />

        {noteRects.map(({ note, rect }) => {
          // Cull notes fully outside the horizontal viewport.
          if (rect.x + rect.w < 0 || rect.x > size.width) return null;
          return (
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
          );
        })}

        {/* Overlays anchor against the published projection. */}
        <ProjectionProvider projection={projection}>
          <OverlayHost score={score} />
        </ProjectionProvider>
      </div>

      {/* Empty-score affordance. */}
      {score.notes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">
            No notes to display. Load a source to see the piano roll.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The piano-roll Display. Renders notes on a pitch (vertical) × time (horizontal)
 * grid, Synthesia-like, and auto-scrolls the time axis to keep the cursor in
 * view. Publishes a `Projection` (both capabilities) and hosts capability-
 * compatible overlays.
 */
export function PianoRoll(props: PianoRollProps) {
  return <PianoRollInner {...props} />;
}
