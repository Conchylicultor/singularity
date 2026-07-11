import type { TimelineHealthPoint } from "../../shared/frames";
import { hostPressureScore, pressureBucket } from "../../shared/pressure";
import type { TimelineWindow } from "./view-model";

// ---------------------------------------------------------------------------
// Health series → heat-strip segments. Pure — co-located bun tests.
// ---------------------------------------------------------------------------

/** Backend lanes bucket on event-loop p99; the host lane on the pressure score. */
export type HeatKind = "backend" | "host";

/**
 * One window-relative segment. `heat` is an elevated stretch (calm stretches
 * render nothing); `dark` is a sampler void — a distinct "no data" class so a
 * wedged/dead sampler or a machine sleep is visually unambiguous from both
 * "healthy" and "elevated". `title` carries the raw values (heat) or the gap
 * classification (dark) for the segment tooltip.
 */
export type HeatSegment =
  | { kind: "heat"; startMs: number; endMs: number; colorClass: string; title: string }
  | { kind: "dark"; startMs: number; endMs: number; reason: "sleep" | "no-data"; title: string };

// When a series has a single point there is no neighbor gap to infer the
// sample cadence from; paint half a health-sampler tick to each side.
const LONE_POINT_HALF_MS = 15_000;

// A point's half-span is capped at GAP_CAP_FACTOR × the series' median
// inter-sample gap, so a point never stretches to the midpoint of a
// multi-minute void and paints "healthy/elevated" across time nobody sampled.
const GAP_CAP_FACTOR = 3;
// A gap beyond GAP_DARK_FACTOR × the median renders its uncovered stretch as a
// dark segment. Between CAP and DARK the gap is simply left transparent
// (mildly irregular cadence isn't evidence of anything).
const GAP_DARK_FACTOR = 6;

/**
 * Severity bucket for one health point, as a translucent semantic-token class
 * (theme-driven — never hardcoded colors). Returns null for the calm bucket so
 * healthy stretches stay transparent and cost zero DOM nodes.
 *
 * Backend: event-loop p99 <100ms calm · <500 mild · <1000 strong · ≥1000 error.
 * Host: the shared pressure score (shared/pressure.ts) — max of the loadAvg1/
 * cpuCount ramp (<0.75 calm · <1.5 mild · <2.5 strong · ≥2.5 error, mirroring
 * slow-ops' loadSeverity) and the compressor decompressions/sec ramp — the
 * SAME ranking the server downsamples by, so kept points are exactly the
 * points colored worst.
 *
 * A point stamped `wallJumpMs` spans a machine sleep: its metrics describe the
 * suspend, not the workload, so it never contributes severity (it classifies
 * its preceding dark gap instead).
 */
export function heatColorClass(
  point: TimelineHealthPoint,
  kind: HeatKind,
  cpuCount: number,
): string | null {
  if (point.wallJumpMs !== undefined) return null;
  if (kind === "host") {
    const bucket = pressureBucket(hostPressureScore(point, cpuCount));
    if (bucket === "error") return "bg-destructive/70";
    if (bucket === "strong") return "bg-warning/80";
    if (bucket === "mild") return "bg-warning/40";
    return null;
  }
  const p99 = point.p99Ms ?? 0;
  if (p99 >= 1000) return "bg-destructive/70";
  if (p99 >= 500) return "bg-warning/80";
  if (p99 >= 100) return "bg-warning/40";
  return null;
}

function formatRate(v: number): string {
  return v >= 10_000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;
}

// Raw values behind a heat segment, for its tooltip (the health points are
// series, not clickable events, so this is where their detail surfaces).
function pointTitle(point: TimelineHealthPoint, kind: HeatKind): string {
  if (kind === "host") {
    const parts = [`load ${(point.loadAvg1 ?? 0).toFixed(1)}`];
    if (point.decompPerSec !== undefined) {
      parts.push(`decomp ${formatRate(point.decompPerSec)}/s`);
    }
    if (point.swap !== undefined) parts.push(`swap ${formatRate(point.swap)}/s`);
    return parts.join(" · ");
  }
  return `p99 ${Math.round(point.p99Ms ?? 0)} ms · max ${Math.round(point.maxMs ?? 0)} ms`;
}

function formatGap(ms: number): string {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)} h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 1000)} s`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Maps a downsampled health series onto segments:
 *
 * - Elevated points paint heat segments spanning toward their neighbor
 *   midpoints, with each half-span capped at GAP_CAP_FACTOR × the series'
 *   median gap (never across a void). Adjacent same-color segments merge so a
 *   sustained incident is one DOM node; calm points are dropped entirely.
 * - Any inter-sample gap (window edges included) beyond GAP_DARK_FACTOR ×
 *   median paints its uncovered stretch as a dark segment — classified
 *   `sleep` when the point ending the gap carries `wallJumpMs`, else
 *   `no-data` (a wedged or dead sampler: during a freeze, the honest answer).
 */
export function heatSegments(
  samples: TimelineHealthPoint[],
  range: TimelineWindow,
  kind: HeatKind,
  cpuCount: number,
): HeatSegment[] {
  const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return [];

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i]!.atMs - sorted[i - 1]!.atMs);
  const medianGapMs = gaps.length > 0 ? median(gaps) : 2 * LONE_POINT_HALF_MS;
  const capMs = GAP_CAP_FACTOR * medianGapMs;
  const darkMs = GAP_DARK_FACTOR * medianGapMs;

  // Per-point capped half-spans — shared by the heat segments and the dark
  // gaps' boundaries so the two tile exactly (no overlap, no sliver).
  const halfBefore = (i: number): number => {
    const point = sorted[i]!;
    const prev = sorted[i - 1]?.atMs;
    const next = sorted[i + 1]?.atMs;
    const raw =
      prev !== undefined
        ? (point.atMs - prev) / 2
        : next !== undefined
          ? (next - point.atMs) / 2
          : LONE_POINT_HALF_MS;
    return Math.min(raw, capMs);
  };
  const halfAfter = (i: number): number => {
    const point = sorted[i]!;
    const prev = sorted[i - 1]?.atMs;
    const next = sorted[i + 1]?.atMs;
    const raw =
      next !== undefined
        ? (next - point.atMs) / 2
        : prev !== undefined
          ? (point.atMs - prev) / 2
          : LONE_POINT_HALF_MS;
    return Math.min(raw, capMs);
  };

  const out: HeatSegment[] = [];
  const push = (seg: HeatSegment): void => {
    const startMs = Math.max(seg.startMs, 0);
    const endMs = Math.min(seg.endMs, range.toMs - range.fromMs);
    if (endMs <= startMs) return;
    const clipped = { ...seg, startMs, endMs };
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      last.kind === "heat" &&
      clipped.kind === "heat" &&
      last.colorClass === clipped.colorClass &&
      clipped.startMs <= last.endMs + 1
    ) {
      last.endMs = Math.max(last.endMs, clipped.endMs);
      return;
    }
    out.push(clipped);
  };
  const pushDark = (absStartMs: number, absEndMs: number, wakePoint?: TimelineHealthPoint): void => {
    const gapMs = absEndMs - absStartMs;
    const reason = wakePoint?.wallJumpMs !== undefined ? ("sleep" as const) : ("no-data" as const);
    push({
      kind: "dark",
      startMs: absStartMs - range.fromMs,
      endMs: absEndMs - range.fromMs,
      reason,
      title:
        reason === "sleep"
          ? `machine sleep ~${formatGap(wakePoint?.wallJumpMs ?? gapMs)}`
          : `no samples for ~${formatGap(gapMs)} — sampler dark (wedged, dead, or no history)`,
    });
  };

  // Leading window-edge gap: ends at the first point, which classifies it.
  const first = sorted[0]!;
  if (first.atMs - range.fromMs > darkMs) {
    pushDark(range.fromMs, first.atMs - halfBefore(0), first);
  }

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]!;
    const colorClass = heatColorClass(point, kind, cpuCount);
    if (colorClass !== null) {
      push({
        kind: "heat",
        startMs: point.atMs - halfBefore(i) - range.fromMs,
        endMs: point.atMs + halfAfter(i) - range.fromMs,
        colorClass,
        title: pointTitle(point, kind),
      });
    }
    const next = sorted[i + 1];
    if (next !== undefined && next.atMs - point.atMs > darkMs) {
      pushDark(point.atMs + halfAfter(i), next.atMs - halfBefore(i + 1), next);
    }
  }

  // Trailing window-edge gap: no wake point — a sampler that has simply
  // stopped reporting (during a live incident, exactly the wedge case).
  const last = sorted[sorted.length - 1]!;
  if (range.toMs - last.atMs > darkMs) {
    pushDark(last.atMs + halfAfter(sorted.length - 1), range.toMs);
  }

  return out.sort((a, b) => a.startMs - b.startMs);
}
