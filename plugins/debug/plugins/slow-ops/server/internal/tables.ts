import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CallerBreakdown } from "../../core";

// Durable, deduped slow-operation aggregate: the persisted analogue of the
// runtime-profiler's in-memory `Aggregate` + `byParent`, gated to spans that
// exceeded their configured threshold. One row per (operationKind, operation,
// worktree); every threshold-exceeding occurrence upserts onto its row,
// bumping the counters and merging its caller (parent span) into `callers`.
export const _slowOps = pgTable(
  "slow_ops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worktree: text("worktree").notNull(),
    operationKind: text("operation_kind").notNull(),
    operation: text("operation").notNull(),
    count: integer("count").notNull().default(0),
    // Span durations are fractional (performance.now() deltas), so this MUST be a
    // float type, not bigint — bigint rejects fractional input ("invalid input
    // syntax for type bigint"). double precision holds ms sums far beyond any
    // worktree's lifetime without overflow, and matches max/last/threshold below.
    totalMs: doublePrecision("total_ms").notNull().default(0),
    maxMs: doublePrecision("max_ms").notNull().default(0),
    lastMs: doublePrecision("last_ms").notNull().default(0),
    thresholdMs: doublePrecision("threshold_ms").notNull().default(0),
    // Caller attribution: which request/loader span issued this operation, how
    // often, how slow. Owned by CallerBreakdownSchema (core).
    callers: jsonb("callers").$type<CallerBreakdown[]>().notNull().default([]),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("slow_ops_kind_op_worktree_idx").on(
      t.operationKind,
      t.operation,
      t.worktree,
    ),
  ],
);
