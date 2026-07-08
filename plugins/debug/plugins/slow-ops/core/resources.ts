import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { ContentionSnapshotSchema } from "@plugins/infra/plugins/contention/core";
import type { WaitBreakdown } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  fieldsToZodObject,
  type FieldsRecord,
} from "@plugins/fields/core";
import { uuidField } from "@plugins/fields/plugins/uuid/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";

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

// The identity subset of a CallerBreakdown — who issued an operation, before
// any per-occurrence counts are merged in. A SpanRef (server span parent) is
// structurally assignable to it; client signals supply { kind: "route", ... }.
export const CallerRefSchema = z.object({ kind: z.string(), label: z.string() });
export type CallerRef = z.infer<typeof CallerRefSchema>;

// Per-layer wait charged to this operation (gate/lock name → summed ms): the
// durable wait-vs-work split. Mirrors the profiler's in-memory `waits`; merged
// per layer on each occurrence. `{}` when the op never waited on a gate.
export const WaitBreakdownSchema = z.record(z.string(), z.number());

// One captured contention sample: the box state at the instant a span tripped
// its threshold, with the span's own duration. Stored as a capped ring on the
// aggregate row (newest first, last 10) so a storm's shape is visible per op
// without unbounded growth. Mirrors the `callers` ring pattern. `traceId` links
// the freshest sample to the durable trace the same trip captured (when the
// engine admitted one), so the aggregate view can deep-link the evidence.
export const SlowOpSampleSchema = z.object({
  atTime: z.coerce.date(),
  durationMs: z.number(),
  snapshot: ContentionSnapshotSchema,
  traceId: z.string().optional(),
});
export type SlowOpSample = z.infer<typeof SlowOpSampleSchema>;

// One deduped slow-operation aggregate (the durable, restart-surviving analogue
// of the profiler's in-memory `Aggregate` + `byParent`, gated to
// threshold-exceeding spans). Keyed by (operationKind, operation, worktree).
export const slowOpFields = {
  id:            uuidField(),
  worktree:      textField(),
  operationKind: textField(),
  operation:     textField(),
  count:         intField(),
  totalMs:       floatField(),
  maxMs:         floatField(),
  lastMs:        floatField(),
  thresholdMs:   floatField(),
  callers:       jsonField<CallerBreakdown[]>({ schema: z.array(CallerBreakdownSchema), default: [] }),
  waits:         jsonField<WaitBreakdown>({ schema: WaitBreakdownSchema, default: {} }),
  recentSamples: jsonField<SlowOpSample[]>({ schema: z.array(SlowOpSampleSchema), default: [] }),
  firstSeenAt:   dateField(),
  lastSeenAt:    dateField(),
} satisfies FieldsRecord;

export const SlowOpSchema = fieldsToZodObject(slowOpFields);
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
