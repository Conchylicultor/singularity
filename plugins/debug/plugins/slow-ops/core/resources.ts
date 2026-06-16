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
