import type { TimelineHealthPoint } from "../../shared/frames";
import type { TimelineWindow } from "./view-model";

// ---------------------------------------------------------------------------
// Health series → heat-strip segments. Pure — co-located bun tests.
// ---------------------------------------------------------------------------

/** Backend lanes bucket on event-loop p99; the host lane on loadAvg1 / cpu. */
export type HeatKind = "backend" | "host";

/** One window-relative elevated segment (calm stretches render nothing). */
export interface HeatSegment {
  startMs: number;
  endMs: number;
  colorClass: string;
}

// When a series has a single point there is no neighbor gap to infer the
// sample cadence from; paint half a health-sampler tick to each side.
const LONE_POINT_HALF_MS = 15_000;

/**
 * Severity bucket for one health point, as a translucent semantic-token class
 * (theme-driven — never hardcoded colors). Returns null for the calm bucket so
 * healthy stretches stay transparent and cost zero DOM nodes.
 *
 * Backend: event-loop p99 <100ms calm · <500 mild · <1000 strong · ≥1000 error.
 * Host: loadAvg1/cpuCount ratio, mirroring slow-ops' loadSeverity ramp
 * (<0.75 calm · <1.5 mild · <2.5 strong · ≥2.5 error).
 */
export function heatColorClass(
  point: TimelineHealthPoint,
  kind: HeatKind,
  cpuCount: number,
): string | null {
  if (kind === "host") {
    const ratio = cpuCount > 0 ? (point.loadAvg1 ?? 0) / cpuCount : 0;
    if (ratio >= 2.5) return "bg-destructive/70";
    if (ratio >= 1.5) return "bg-warning/80";
    if (ratio >= 0.75) return "bg-warning/40";
    return null;
  }
  const p99 = point.p99Ms ?? 0;
  if (p99 >= 1000) return "bg-destructive/70";
  if (p99 >= 500) return "bg-warning/80";
  if (p99 >= 100) return "bg-warning/40";
  return null;
}

/**
 * Maps a downsampled health series onto contiguous heat segments: each point
 * owns the span to the midpoints of its neighbors (edge points extend by the
 * adjacent half-gap), clamped to the window. Adjacent same-color segments
 * merge so a sustained incident is one DOM node, and calm points are dropped
 * entirely.
 */
export function heatSegments(
  samples: TimelineHealthPoint[],
  range: TimelineWindow,
  kind: HeatKind,
  cpuCount: number,
): HeatSegment[] {
  const sorted = [...samples].sort((a, b) => a.atMs - b.atMs);
  const out: HeatSegment[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]!;
    const colorClass = heatColorClass(point, kind, cpuCount);
    if (colorClass === null) continue;

    const prev = sorted[i - 1]?.atMs;
    const next = sorted[i + 1]?.atMs;
    const halfBefore =
      prev !== undefined
        ? (point.atMs - prev) / 2
        : next !== undefined
          ? (next - point.atMs) / 2
          : LONE_POINT_HALF_MS;
    const halfAfter =
      next !== undefined
        ? (next - point.atMs) / 2
        : prev !== undefined
          ? (point.atMs - prev) / 2
          : LONE_POINT_HALF_MS;

    const startMs = Math.max(point.atMs - halfBefore, range.fromMs);
    const endMs = Math.min(point.atMs + halfAfter, range.toMs);
    if (endMs <= startMs) continue;

    const rel = {
      startMs: startMs - range.fromMs,
      endMs: endMs - range.fromMs,
      colorClass,
    };
    const last = out[out.length - 1];
    if (last && last.colorClass === colorClass && rel.startMs <= last.endMs + 1) {
      last.endMs = Math.max(last.endMs, rel.endMs);
    } else {
      out.push(rel);
    }
  }
  return out;
}
