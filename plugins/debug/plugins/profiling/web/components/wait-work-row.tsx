import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { growClass } from "@plugins/primitives/plugins/css/plugins/grow/web";
import { minBarSize } from "./use-gantt-zoom";
import { type ReactElement } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { formatDuration, useGanttContainerContext } from "./gantt-container";
import { useProfilingContext, type Span } from "./shared";

/**
 * A resource span rendered as ONE row on the shared Gantt timeline with two
 * segments: a muted `wait` segment (network + queue) followed by a solid `work`
 * segment (server loader/read time). wait = durationMs - (workMs ?? 0).
 *
 * Mirrors SpanRow's three-column layout (w-40 label · flex-1 track · w-16
 * duration) so it aligns with the TimeAxis and the macro-phase rows.
 */
export function WaitWorkRow({
  id,
  phase,
  label,
  startMs,
  durationMs,
  workMs,
  detail,
  waitClass = "bg-categorical-4/40",
  workClass = "bg-categorical-4",
}: {
  id: string;
  phase: string;
  label: string;
  startMs: number;
  durationMs: number;
  workMs?: number;
  detail?: string;
  /** Color of the muted wait segment (must be a literal Tailwind class). */
  waitClass?: string;
  /** Color of the solid work segment (must be a literal Tailwind class). */
  workClass?: string;
}): ReactElement {
  const { toLeftFraction, toWidthFraction, totalMs } =
    useGanttContainerContext();
  const { hovered, setHovered } = useProfilingContext();
  const isHovered = hovered?.id === id;

  const work = workMs ?? 0;
  const wait = Math.max(0, durationMs - work);
  const workStartMs = startMs + wait;

  // Synthesized Span so SpanDetail can render this resource on hover.
  const span: Span = { id, phase, label, startMs, durationMs };

  return (
    <Stack
      direction="row"
      align="center"
      gap="sm"
      className="py-2xs"
      onMouseEnter={() => setHovered(span)}
      onMouseLeave={() => setHovered(null)}
    >
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 160px (w-40) label column kept rigid (shrink-0) to align with the Gantt time axis (LABEL_WIDTH) */}
      <div className="w-40 shrink-0 truncate font-mono text-2xs text-muted-foreground">
        {label}
      </div>
      {/* The timeline track: the coordinate host for the two segments, clipping
          what overflows it, and the cell that takes the row's slack. */}
      <Clip className={cn("relative h-5 rounded-md bg-muted/30", growClass())}>
        <Placed
          x={{
            start: pct(toLeftFraction(startMs, totalMs)),
            size: pct(toWidthFraction(wait, totalMs)),
            minSize: minBarSize(wait),
          }}
          y="fill"
          className={cn(
            "rounded-md transition-opacity",
            waitClass,
            isHovered ? "opacity-100" : "opacity-70",
          )}
        />
        <Placed
          x={{
            start: pct(toLeftFraction(workStartMs, totalMs)),
            size: pct(toWidthFraction(work, totalMs)),
            minSize: minBarSize(work),
          }}
          y="fill"
          className={cn(
            "rounded-md transition-opacity",
            workClass,
            isHovered ? "opacity-100" : "opacity-70",
          )}
        />
      </Clip>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 64px (w-16) duration column kept rigid (shrink-0) to align with the Gantt time axis (DURATION_WIDTH) */}
      <div className="w-16 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
        {formatDuration(durationMs)}
        {work > 0 && (
          <div className="text-3xs text-muted-foreground/60">
            work {formatDuration(work)}
          </div>
        )}
        {detail && (
          <div className="text-3xs text-muted-foreground/60">{detail}</div>
        )}
      </div>
    </Stack>
  );
}
