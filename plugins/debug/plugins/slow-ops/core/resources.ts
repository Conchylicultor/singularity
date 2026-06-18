import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { ContentionSnapshotSchema } from "@plugins/infra/plugins/contention/core";

// Per-operation caller attribution: who issued this operation (the immediate
// enclosing request/loader span), how often, and how slow. Mirrors the
// profiler's in-memory `ParentBreakdown`, persisted alongside the aggregate.
export const CallerBreakdownSchema = z.object({
  kind: z.string(),
  label: z.string(),
  count: z.number().int(),
  totalMs: z.number(),
  maxMs: z.number(),
});
export type CallerBreakdown = z.infer<typeof CallerBreakdownSchema>;

// One captured contention sample: the box state at the instant a span tripped
// its threshold, with the span's own duration. Stored as a capped ring on the
// aggregate row (newest first, last 10) so a storm's shape is visible per op
// without unbounded growth. Mirrors the `callers` ring pattern.
export const SlowOpSampleSchema = z.object({
  atTime: z.coerce.date(),
  durationMs: z.number(),
  snapshot: ContentionSnapshotSchema,
});
export type SlowOpSample = z.infer<typeof SlowOpSampleSchema>;

// One deduped slow-operation aggregate (the durable, restart-surviving analogue
// of the profiler's in-memory `Aggregate` + `byParent`, gated to
// threshold-exceeding spans). Keyed by (operationKind, operation, worktree).
export const SlowOpSchema = z.object({
  id: z.string().uuid(),
  worktree: z.string(),
  operationKind: z.string(),
  operation: z.string(),
  count: z.number().int(),
  totalMs: z.number(),
  maxMs: z.number(),
  lastMs: z.number(),
  thresholdMs: z.number(),
  callers: z.array(CallerBreakdownSchema),
  recentSamples: z.array(SlowOpSampleSchema),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
});
export type SlowOp = z.infer<typeof SlowOpSchema>;

export const slowOpsResource = resourceDescriptor<SlowOp[]>(
  "slow-ops",
  z.array(SlowOpSchema),
  [],
);

// The web-safe overlay shape for the health-monitor charts: a slim projection of
// a sample (no full contention snapshot), published one-per-recorded-slow-op to
// the persisted `slow-op-markers` channel and read back per worktree to draw a
// severity-colored ReferenceLine at each spike's timestamp.
export const SlowOpMarkerSchema = z.object({
  atTime: z.coerce.date(), // wall-clock instant the span tripped
  durationMs: z.number(),
  operationKind: z.string(),
  operation: z.string(),
  loadAvg1: z.number(), // for the severity ramp
  cpuCount: z.number(),
});
export type SlowOpMarker = z.infer<typeof SlowOpMarkerSchema>;

// Load relative to cores is the contention signal: ≥1.5× cores = saturated
// (warning), ≥2.5× = severe (destructive). The single source of truth for the
// muted→warning→destructive ramp, shared by the cluster timeline badges and the
// health-monitor spike-line overlay.
export function loadSeverity(
  loadAvg1: number,
  cpuCount: number,
): "muted" | "warning" | "destructive" {
  const ratio = cpuCount > 0 ? loadAvg1 / cpuCount : 0;
  if (ratio >= 2.5) return "destructive";
  if (ratio >= 1.5) return "warning";
  return "muted";
}
