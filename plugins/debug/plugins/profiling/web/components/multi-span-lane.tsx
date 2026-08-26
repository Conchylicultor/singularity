import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { growClass } from "@plugins/primitives/plugins/css/plugins/grow/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { MIN_BAR_FRACTION, minBarSize } from "./use-gantt-zoom";
import { type ReactElement, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useGanttContainerContext } from "./gantt-container";

/**
 * One bar on a MultiSpanLane track. Fill (`colorClass`) answers "what is this?"
 * and never changes with state; `treatment` layers status on top (pulse = open /
 * in-flight), mirroring op-gantt's fill=type / treatment=state convention.
 * `overlays` paint on TOP of the full-extent work bar at their own absolute
 * bar-relative offsets — so they may gap (idle stretches between waits) and even
 * overlap (two layers blocked at the same instant), which a consecutive segment
 * list structurally could not express.
 */
export interface SpanBar {
  id: string;
  startMs: number;
  durationMs: number;
  /** Fill color — a literal Tailwind token class (bg-categorical-*, bg-info, …). */
  colorClass: string;
  treatment?: "solid" | "pulse";
  /** Bar-relative, absolutely positioned. May gap and overlap. Painted OVER the work bar. */
  overlays?: { startMs: number; ms: number; colorClass: string }[];
}

/**
 * A generic Gantt lane hosting N absolute bars on one track. Mirrors SpanRow's
 * three-column layout (w-40 label · flex-1 track · w-16 duration) so it aligns
 * with the TimeAxis and the macro-phase rows, and generalizes the multi-bar-per-
 * row pattern hand-rolled in op-gantt. Bars are positioned via the ambient
 * GanttContainer px-mapping; a click fires onBarClick(id) (the pointerdown is
 * stopped so it never falls through to the container's drag-zoom capture).
 */
export function MultiSpanLane({
  label,
  bars,
  duration,
  onBarClick,
}: {
  /** Rigid left label cell (aligned to LABEL_WIDTH). */
  label: ReactNode;
  bars: SpanBar[];
  /** Rigid right duration cell (aligned to DURATION_WIDTH); optional content. */
  duration?: ReactNode;
  /** Fired with the clicked bar's id; presence also makes bars clickable. */
  onBarClick?: (id: string) => void;
}): ReactElement {
  return (
    <Stack direction="row" align="center" gap="sm" className="py-2xs">
      {/* Fixed 160px (w-40) label column, rigid so it stays aligned with the
          Gantt time axis (LABEL_WIDTH). */}
      <div
        className={cn(
          "w-40 truncate font-mono text-2xs text-muted-foreground",
          rigidClass(),
        )}
      >
        {label}
      </div>
      {/* The timeline track: the coordinate host for the bars, clipping what
          overflows it, and the cell that takes the row's slack. */}
      <Clip className={cn("relative h-5 rounded-md bg-muted/30", growClass())}>
        {bars.map((bar) => (
          <Bar key={bar.id} bar={bar} onBarClick={onBarClick} />
        ))}
      </Clip>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 64px (w-16) duration column kept rigid (shrink-0) to align with the Gantt time axis (DURATION_WIDTH) */}
      <div className="w-16 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
        {duration}
      </div>
    </Stack>
  );
}

/** Renders one solid work bar for the full extent, plus any absolute overlays on top. */
function Bar({
  bar,
  onBarClick,
}: {
  bar: SpanBar;
  onBarClick?: (id: string) => void;
}): ReactElement {
  const { toLeftFraction, toWidthFraction, totalMs } =
    useGanttContainerContext();
  const clickable = onBarClick !== undefined;
  const treatment = bar.treatment === "pulse" ? "animate-pulse" : "";

  // Zero-length overlays would paint nothing (`minBarSize` declines to floor an
  // empty span), so they are dropped rather than emitted as empty boxes.
  const overlays = (bar.overlays ?? []).filter((o) => o.ms > 0);

  return (
    <>
      {/* The full-extent work bar. It is the click target; overlays are decorative
          and sit on top of it. */}
      <Placed
        x={{
          start: pct(toLeftFraction(bar.startMs, totalMs)),
          size: pct(toWidthFraction(bar.durationMs, totalMs)),
          // Floored UNCONDITIONALLY, unlike the wait/work rows: on this lane a
          // zero-duration bar is a POINT EVENT (a report at its lastSeenAt),
          // not an absent segment, so the floor is what makes it visible at all.
          minSize: pct(MIN_BAR_FRACTION),
        }}
        y="fill"
        className={cn(
          "rounded-md",
          bar.colorClass,
          treatment,
          clickable && "cursor-pointer",
        )}
        // Stop the pointerdown reaching GanttContainer's drag-zoom, which would
        // setPointerCapture and retarget the click off this bar (op-gantt precedent).
        onPointerDown={clickable ? (e) => e.stopPropagation() : undefined}
        onClick={
          clickable
            ? (e) => {
                e.stopPropagation();
                onBarClick(bar.id);
              }
            : undefined
        }
      />
      {/* Overlays at their true bar-relative offsets. pointer-events-none so a
          click on an overlay still lands on the work bar beneath it. */}
      {overlays.map((o, i) => (
        <Placed
          key={`${bar.id}:o:${i}`}
          decorative
          x={{
            start: pct(toLeftFraction(bar.startMs + o.startMs, totalMs)),
            size: pct(toWidthFraction(o.ms, totalMs)),
            minSize: minBarSize(o.ms),
          }}
          y="fill"
          className={cn("rounded-md", o.colorClass)}
        />
      ))}
    </>
  );
}
