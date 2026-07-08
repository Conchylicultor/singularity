import { type ReactElement, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useGanttContainerContext } from "./gantt-container";

/**
 * One bar on a MultiSpanLane track. Fill (`colorClass`) answers "what is this?"
 * and never changes with state; `treatment` layers status on top (pulse = open /
 * in-flight), mirroring push-gantt's fill=type / treatment=state convention.
 * `segments` splits the bar into consecutive wait/work slices (WaitWorkRow's
 * lighter-leading-wait convention) — omit for a single solid bar.
 */
export interface SpanBar {
  id: string;
  startMs: number;
  durationMs: number;
  /** Fill color — a literal Tailwind token class (bg-categorical-*, bg-info, …). */
  colorClass: string;
  treatment?: "solid" | "pulse";
  segments?: { kind: "wait" | "work"; ms: number }[];
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

/** Renders a single bar as one solid slice, or as its consecutive wait/work segments. */
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

  const rawSegments =
    bar.segments && bar.segments.length > 0
      ? bar.segments
      : [{ kind: "work" as const, ms: bar.durationMs }];

  // Lay segments consecutively from the bar start; skip zero-width slices so the
  // 0.3% min-width floor in toWidthPct never paints an empty segment as a sliver.
  const slices: { startMs: number; ms: number; kind: "wait" | "work" }[] = [];
  let cursor = bar.startMs;
  for (const seg of rawSegments) {
    if (seg.ms > 0) slices.push({ startMs: cursor, ms: seg.ms, kind: seg.kind });
    cursor += seg.ms;
  }

  return (
    <>
      {slices.map((slice, i) => (
        <div
          key={`${bar.id}:${i}`}
          // eslint-disable-next-line layout/no-adhoc-layout -- bar segment positioned by runtime ms→% offsets (left/width inline style)
          className={cn(
            "absolute top-0 h-full rounded-md transition-opacity",
            bar.colorClass,
            treatment,
            // Wait is the muted leading segment (WaitWorkRow convention); work is solid.
            slice.kind === "wait" && "opacity-40",
            clickable && "cursor-pointer",
          )}
          style={{
            left: toLeftPct(slice.startMs, totalMs),
            width: toWidthPct(slice.ms, totalMs),
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
      ))}
    </>
  );
}
