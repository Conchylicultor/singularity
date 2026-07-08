import { useMemo, type ReactElement } from "react";
import type { SpanKind } from "@plugins/infra/plugins/runtime-profiler/core";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  MultiSpanLane,
  formatDuration,
  type SpanBar,
} from "@plugins/debug/plugins/profiling/web";
import type { TraceLaneProps, TraceSelection } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { normalizeTrace, type NormalizedBar } from "../internal/normalize";

// Categorical color + label per span kind (fill = "what", never state — the
// push-gantt convention). Ordering mirrors normalize's KIND_ORDER (entry kinds
// first, db last).
const KIND_CONFIG: Record<SpanKind, { label: string; bar: string; dot: string; bg: string }> = {
  http: { label: "HTTP", bar: "bg-categorical-1", dot: "bg-categorical-1", bg: "bg-categorical-1/5" },
  sub: { label: "Sub", bar: "bg-categorical-2", dot: "bg-categorical-2", bg: "bg-categorical-2/5" },
  push: { label: "Push", bar: "bg-categorical-3", dot: "bg-categorical-3", bg: "bg-categorical-3/5" },
  flush: { label: "Flush", bar: "bg-categorical-4", dot: "bg-categorical-4", bg: "bg-categorical-4/5" },
  cascade: { label: "Cascade", bar: "bg-categorical-8", dot: "bg-categorical-8", bg: "bg-categorical-8/5" },
  loader: { label: "Loader", bar: "bg-categorical-5", dot: "bg-categorical-5", bg: "bg-categorical-5/5" },
  job: { label: "Job", bar: "bg-categorical-6", dot: "bg-categorical-6", bg: "bg-categorical-6/5" },
  db: { label: "DB", bar: "bg-categorical-7", dot: "bg-categorical-7", bg: "bg-categorical-7/5" },
};

// The spans Gantt lane group: window-relative flight-window bars grouped by span
// kind, one MultiSpanLane row per (kind,label). A bar click reports the span's
// full decomposition up to the pane's shared detail strip via `onSelect`.
export function SpansLane({ trace, onSelect }: TraceLaneProps): ReactElement {
  const { lanes } = useMemo(() => normalizeTrace(trace), [trace]);

  // Group lanes by kind, preserving normalize's kind ordering.
  const groups = useMemo(() => {
    const byKind = new Map<SpanKind, typeof lanes>();
    for (const lane of lanes) {
      const list = byKind.get(lane.kind) ?? [];
      list.push(lane);
      byKind.set(lane.kind, list);
    }
    return [...byKind.entries()];
  }, [lanes]);

  if (lanes.length === 0) {
    return (
      <Stack gap="none" className="px-lg py-sm">
        <Placeholder tone="muted">
          No spans in flight or recently completed (≥5ms) during this window.
        </Placeholder>
      </Stack>
    );
  }

  return (
    <>
      {groups.map(([kind, kindLanes]) => {
        const config = KIND_CONFIG[kind];
        const total = kindLanes.reduce((n, l) => n + l.bars.length, 0);
        return (
          <div key={kind} className={cn("border-b", config.bg)}>
            <Stack direction="row" align="center" gap="sm" className="px-lg py-xs">
              <div className={cn("size-2.5 rounded-full", config.dot)} />
              <Text as="div" variant="caption" className="font-semibold">
                {config.label}
              </Text>
              <Text as="div" variant="caption" className="tabular-nums text-muted-foreground">
                {total} span{total === 1 ? "" : "s"}
              </Text>
            </Stack>
            <Stack gap="2xs" className="px-lg pb-sm">
              {kindLanes.map((lane) => (
                <MultiSpanLane
                  key={lane.key}
                  label={lane.label}
                  duration={durationCell(lane.bars)}
                  bars={lane.bars.map((bar) => toSpanBar(bar, config.bar))}
                  onBarClick={(id) => {
                    const bar = lane.bars.find((b) => b.id === id);
                    if (bar) onSelect?.(toSelection(bar, trace.wallTime, trace.atMs));
                  }}
                />
              ))}
            </Stack>
          </div>
        );
      })}
    </>
  );
}

function durationCell(bars: NormalizedBar[]): string {
  if (bars.length === 1) return formatDuration(bars[0]!.durationMs);
  return `×${bars.length}`;
}

function toSpanBar(bar: NormalizedBar, colorClass: string): SpanBar {
  return {
    id: bar.id,
    startMs: bar.startMs,
    durationMs: bar.durationMs,
    colorClass,
    treatment: bar.open ? "pulse" : "solid",
    segments: bar.segments,
  };
}

// Wall-clock anchor: profiler-clock t maps to wall via wallTime + (t − atMs).
function wallAt(wallTime: string, atMs: number, t: number): string {
  const base = new Date(wallTime).getTime();
  const d = new Date(base + (t - atMs));
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function toSelection(bar: NormalizedBar, wallTime: string, atMs: number): TraceSelection {
  const fields: TraceSelection["fields"] = [
    { label: "kind", value: bar.kind },
    {
      label: "when",
      value:
        bar.t1 === null
          ? `${wallAt(wallTime, atMs, bar.t0)} → open`
          : `${wallAt(wallTime, atMs, bar.t0)} → ${wallAt(wallTime, atMs, bar.t1)}`,
    },
    { label: "duration", value: formatDuration(bar.ageMs) },
    { label: "wait / child / self", value: `${ms(bar.waitMs)} / ${ms(bar.childMs)} / ${ms(bar.selfMs)}` },
  ];
  if (bar.parents.length > 0) {
    fields.push({
      label: "parent",
      value: bar.parents.map((p) => `${p.kind}:${p.label}`).join(" ← "),
    });
  }
  if (bar.segments && bar.waitMs > 0) {
    fields.push({ label: "wait total (position approximate)", value: ms(bar.waitMs) });
  }
  if (bar.waits && Object.keys(bar.waits).length > 0) {
    fields.push({
      label: "waits",
      value: Object.entries(bar.waits)
        .sort((a, b) => b[1] - a[1])
        .map(([layer, w]) => `${layer} ${ms(w)}`)
        .join(" · "),
    });
  }
  return { title: `${bar.kind}:${bar.label}`, fields };
}

function ms(v: number): string {
  return `${Math.round(v)}ms`;
}
