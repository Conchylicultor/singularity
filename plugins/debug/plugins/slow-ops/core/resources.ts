import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

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
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
});
export type SlowOp = z.infer<typeof SlowOpSchema>;

export const slowOpsResource = resourceDescriptor<SlowOp[]>(
  "slow-ops",
  z.array(SlowOpSchema),
  [],
);
