import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bars,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { buildProjection } from "./geometry";
import { ProjectionProvider } from "./projection-context";
import { OverlayHost } from "./overlay-host";
import { PitchAxisHost } from "./pitch-axis-host";

/** Props the shell's `Sonata.Display.Dispatch` passes to the chosen display. */
export interface PianoRollProps {
  score: Score;
  cursorBeat: number;
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

/** Bar lines + now-line, drawn as absolutely-positioned elements over the lane. */
function GridLines({
  score,
  beatToY,
  laneWidth,
  laneHeight,
}: {
  score: Score;
  beatToY: (beat: number) => number;
  laneWidth: number;
  laneHeight: number;
}) {
  const barList = useMemo(() => bars(score), [score]);
  // Only render bar lines that fall within the visible window (+margin).
  const visibleBars = barList.filter((b) => {
    const y = beatToY(b.startBeat);
    return y >= -40 && y <= laneHeight + 40;
  });

  return (
    <>
      {visibleBars.map((b) => (
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
      {/* Playback now-line: where falling notes land on the keyboard. */}
      <div
        className="pointer-events-none absolute left-0 z-20 h-0.5 bg-primary"
        style={{ top: laneHeight, width: laneWidth }}
      />
    </>
  );
}

function PianoRollInner({ score, cursorBeat }: PianoRollProps) {
  // We measure the LANE (above the keyboard); its height drives the time axis.
  const [laneRef, lane] = useElementSize();

  const projection = useMemo(
    () =>
      buildProjection({
        width: lane.width,
        height: lane.height,
        cursorBeat,
        score,
      }),
    [lane.width, lane.height, cursorBeat, score],
  );

  // Note rectangles, derived from the projection (single geometry source).
  const noteRects = useMemo(() => {
    const toRect = projection.noteToRect!;
    return score.notes.map((n) => ({ note: n, rect: toRect(n) }));
  }, [projection, score.notes]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* The note lane. Time scrolls vertically (virtual — derived from
          `cursorBeat`); pitch is the fixed full keyboard across the width, so
          notes align column-for-key with the keyboard below. */}
      <div ref={laneRef} className="relative min-h-0 flex-1 overflow-hidden">
        <GridLines
          score={score}
          beatToY={projection.beatToY!}
          laneWidth={lane.width}
          laneHeight={lane.height}
        />

        {noteRects.map(({ note, rect }) => {
          // Cull notes fully outside the vertical viewport.
          if (rect.y + rect.h < 0 || rect.y > lane.height) return null;
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
