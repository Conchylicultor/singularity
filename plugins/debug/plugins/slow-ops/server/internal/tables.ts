import { uniqueIndex } from "drizzle-orm/pg-core";
import {
  defineEntity,
  defaultNow,
  defaultRandom,
} from "@plugins/infra/plugins/entities/server";
import { slowOpFields } from "../../core";

// Durable, deduped slow-operation aggregate: the persisted analogue of the
// runtime-profiler's in-memory `Aggregate` + `byParent`, gated to spans that
// exceeded their configured threshold. One row per (operationKind, operation,
// worktree); every threshold-exceeding occurrence upserts onto its row,
// bumping the counters and merging its caller (parent span) into `callers`.
//
// The table + the `SlowOp` wire schema both derive from the single
// `slowOpFields` record (core), so a column/schema drift is unrepresentable.
const slowOps = defineEntity("slow_ops", slowOpFields, {
  primaryKey: "id",
  columns: {
    id:            { default: defaultRandom() },
    count:         { default: 0 },
    totalMs:       { default: 0 },
    maxMs:         { default: 0 },
    lastMs:        { default: 0 },
    thresholdMs:   { default: 0 },
    callers:       { default: [] },
    recentSamples: { default: [] },
    firstSeenAt:   { default: defaultNow() },
    lastSeenAt:    { default: defaultNow() },
  },
  indexes: (t) => [
    uniqueIndex("slow_ops_kind_op_worktree_idx").on(
      t.operationKind,
      t.operation,
      t.worktree,
    ),
  ],
});

// drizzle-kit schema-glob discovery. Name kept so consumers don't churn.
export const _slowOps = slowOps.table;
