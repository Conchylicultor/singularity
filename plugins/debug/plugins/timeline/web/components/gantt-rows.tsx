import type { ReactElement, ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useGanttContainerContext } from "@plugins/debug/plugins/profiling/web";
import {
  IncidentBadge,
  incidentColorClass,
} from "@plugins/debug/plugins/trace/plugins/pane/web";
import type { TimelineHealthPoint } from "../../shared/frames";
import { heatSegments, type HeatKind } from "../internal/heat";
import type { IncidentBand } from "../internal/bands";
import type { TimelineWindow } from "../internal/view-model";
import { wallclockTicks } from "../internal/ticks";

/**
 * The custom Gantt-aligned rows of the Timeline tab. Every row mirrors
 * MultiSpanLane's three-column geometry (w-40 label · flex-1 track · w-16
 * duration) so it stays pixel-aligned with the TimeAxis, and positions its
 * runtime content through the ambient GanttContainer ms→% mapping (zoom-aware
 * for free).
 */
function GanttRow({
  label,
  track,
  trackClassName,
  className,
}: {
  label?: ReactNode;
  /** Absolutely-positioned children of the relative track cell. */
  track: ReactNode;
  trackClassName?: string;
  className?: string;
}): ReactElement {
  return (
    <Stack direction="row" align="center" gap="sm" className={className}>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 160px (w-40) label column kept rigid (shrink-0) to align with the Gantt time axis (LABEL_WIDTH), mirroring MultiSpanLane */}
      <div className="w-40 shrink-0 truncate">{label}</div>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible timeline track (flex-1) hosting runtime-positioned children, mirroring MultiSpanLane */}
      <div className={cn("relative flex-1", trackClassName)}>{track}</div>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 64px (w-16) duration-column spacer kept rigid (shrink-0) to align with the Gantt time axis (DURATION_WIDTH) */}
      <div className="w-16 shrink-0" />
    </Stack>
  );
}

/**
 * Absolute HH:MM tick row. The GanttContainer's built-in TimeAxis is
 * window-relative (offsets from 0), so this thin row underneath carries the
 * wall-clock reading. Ticks are generated for the full window; under zoom the
 * out-of-view ones are skipped (the relative axis keeps carrying offsets).
 */
export function WallclockAxis({ range }: { range: TimelineWindow }): ReactElement {
  const { toLeftPct, totalMs } = useGanttContainerContext();
  const ticks = wallclockTicks(range);
  return (
    <GanttRow
      className="h-6 border-b"
      trackClassName="h-full"
      track={ticks.map((tick) => {
        const pct = parseFloat(toLeftPct(tick.relMs, totalMs));
        if (pct < 0 || pct > 100) return null;
        return (
          <div
            key={tick.relMs}
            // eslint-disable-next-line layout/no-adhoc-layout -- tick positioned by runtime % offset along the time axis (left inline style), mirroring TimeAxis
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${pct}%` }}
          >
            <div className="h-1.5 w-px bg-border" />
            <Text as="span" variant="caption" tone="muted" className="tabular-nums">
              {tick.label}
            </Text>
          </div>
        );
      })}
    />
  );
}

/**
 * Thin health heat strip under a lane group: background segments bucketed by
 * event-loop p99 (backend lanes) or loadAvg1/cpu (host lane); calm stretches
 * stay transparent.
 */
export function HeatStrip({
  label,
  samples,
  range,
  kind,
  cpuCount,
}: {
  label: string;
  samples: TimelineHealthPoint[];
  range: TimelineWindow;
  kind: HeatKind;
  cpuCount: number;
}): ReactElement {
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();
  const segments = heatSegments(samples, range, kind, cpuCount);
  return (
    <GanttRow
      className="py-2xs"
      label={
        <Text as="span" variant="caption" tone="muted" className="font-mono">
          {label}
        </Text>
      }
      trackClassName="h-1.5 rounded-full bg-muted/30"
      track={segments.map((seg, i) => (
        <div
          key={i}
          // eslint-disable-next-line layout/no-adhoc-layout -- heat segment positioned by runtime ms→% offsets (left/width inline style), mirroring MultiSpanLane's bars
          className={cn("absolute top-0 h-full", seg.colorClass)}
          style={{
            left: toLeftPct(seg.startMs, totalMs),
            width: toWidthPct(seg.endMs - seg.startMs, totalMs),
          }}
        />
      ))}
    />
  );
}

/**
 * Translucent full-height vertical incident bands, painted BEHIND the lanes
 * (mounted via Overlay `behind`). One band per multi-event incident, tinted
 * with the same stable palette as the trace pane's incident chips.
 */
export function IncidentBandLayer({ bands }: { bands: IncidentBand[] }): ReactElement {
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();
  return (
    <GanttRow
      className="h-full"
      trackClassName="h-full"
      track={bands.map((band) => (
        <div
          key={band.incidentId}
          // eslint-disable-next-line layout/no-adhoc-layout -- incident band positioned by runtime ms→% offsets (left/width inline style), mirroring MultiSpanLane's bars
          className={cn(
            "absolute top-0 h-full rounded-md opacity-15",
            incidentColorClass(band.colorIndex),
          )}
          style={{
            left: toLeftPct(band.startMs, totalMs),
            width: toWidthPct(band.endMs - band.startMs, totalMs),
          }}
        />
      ))}
    />
  );
}

/**
 * Incident chips at each band's start. Rendered as its own thin row ABOVE the
 * lanes (not inside the behind-layer, where lane content would swallow the
 * badge tooltips).
 */
export function IncidentBadgeRow({ bands }: { bands: IncidentBand[] }): ReactElement {
  const { toLeftPct, totalMs } = useGanttContainerContext();
  return (
    <GanttRow
      className="py-2xs"
      label={
        <Text as="span" variant="caption" tone="muted" className="font-mono">
          incidents
        </Text>
      }
      trackClassName="h-5"
      track={bands.map((band) => (
        <div
          key={band.incidentId}
          // eslint-disable-next-line layout/no-adhoc-layout -- badge pinned at the band's runtime % offset (left inline style)
          className="absolute top-0"
          style={{ left: toLeftPct(band.startMs, totalMs) }}
        >
          <IncidentBadge info={band} windowSpanMs={band.endMs - band.startMs} />
        </div>
      ))}
    />
  );
}
