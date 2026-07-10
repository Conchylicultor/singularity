import { type ReactElement, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useGanttContainerContext } from "./gantt-container";

/**
 * One bar on a MultiSpanLane track. Fill (`colorClass`) answers "what is this?"
 * and never changes with state; `treatment` layers status on top (pulse = open /
 * in-flight), mirroring push-gantt's fill=type / treatment=state convention.
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
 * row pattern hand-rolled in push-gantt. Bars are positioned via the ambient
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
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 160px (w-40) label column kept rigid (shrink-0) to align with the Gantt time axis (LABEL_WIDTH) */}
      <div className="w-40 shrink-0 truncate font-mono text-2xs text-muted-foreground">
        {label}
      </div>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible timeline track (flex-1) clipping the runtime-positioned bars (overflow-hidden) */}
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted/30">
        {bars.map((bar) => (
          <Bar key={bar.id} bar={bar} onBarClick={onBarClick} />
        ))}
      </div>
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
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();
  const clickable = onBarClick !== undefined;
  const treatment = bar.treatment === "pulse" ? "animate-pulse" : "";

  // Skip zero-width overlays so the 0.3% min-width floor in toWidthPct never
  // paints an empty overlay as a sliver.
  const overlays = (bar.overlays ?? []).filter((o) => o.ms > 0);

  return (
    <>
      {/* The full-extent work bar. It is the click target; overlays are decorative
          and sit on top of it. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- bar positioned by runtime ms→% offsets (left/width inline style)
        className={cn(
          "absolute top-0 h-full rounded-md",
          bar.colorClass,
          treatment,
          clickable && "cursor-pointer",
        )}
        style={{
          left: toLeftPct(bar.startMs, totalMs),
          width: toWidthPct(bar.durationMs, totalMs),
        }}
        // Stop the pointerdown reaching GanttContainer's drag-zoom, which would
        // setPointerCapture and retarget the click off this bar (push-gantt precedent).
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
        <div
          key={`${bar.id}:o:${i}`}
          // eslint-disable-next-line layout/no-adhoc-layout -- overlay positioned by runtime ms→% offsets (left/width inline style)
          className={cn("pointer-events-none absolute top-0 h-full rounded-md", o.colorClass)}
          style={{
            left: toLeftPct(bar.startMs + o.startMs, totalMs),
            width: toWidthPct(o.ms, totalMs),
          }}
        />
      ))}
    </>
  );
}
