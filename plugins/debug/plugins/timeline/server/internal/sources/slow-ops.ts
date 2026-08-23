import { z } from "zod";
import { SlowOpSampleSchema } from "@plugins/debug/plugins/slow-ops/core";
import type { TimelineEvent } from "../../../core";
import { overlapsWindow } from "../window";
import { slowOpSeverity } from "../severity";
import {
  defineDbSource,
  type DbSource,
  type DbSourceCtx,
  type SqlQuery,
} from "./context";

// Each slow_ops row is a deduped per-operation AGGREGATE; the timeline events
// come from its recentSamples ring (each sample = one actual slow occurrence,
// interval [atTime − durationMs, atTime]). The ring is bounded, so a long
// window shows at most the ring's worth of occurrences per operation — the
// aggregate row itself is the lossless record.
const RawSlowOpRowSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  operation_kind: z.string(),
  operation: z.string(),
  // float8 — a real number. `recent_samples` is jsonb, so its `atTime`s are
  // ISO strings inside the blob: SlowOpSampleSchema's coercion is what turns
  // them into Dates, and it genuinely fires.
  threshold_ms: z.number(),
  recent_samples: z.array(SlowOpSampleSchema),
});
export type SlowOpRow = z.infer<typeof RawSlowOpRowSchema>;

function buildSlowOpsQuery(ctx: DbSourceCtx): SqlQuery {
  // A sample's atTime never exceeds its row's last_seen_at, so rows with
  // last_seen_at < fromMs cannot contribute an overlapping sample. Same
  // fork-inherited-row scoping as the traces source.
  const worktreeFilter = ctx.isMainDb ? "" : "AND worktree = $2";
  return {
    text: `
      SELECT id, worktree, operation_kind, operation, threshold_ms, recent_samples
      FROM slow_ops
      WHERE last_seen_at >= to_timestamp($1::double precision / 1000.0)
        ${worktreeFilter}
    `,
    values: ctx.isMainDb ? [ctx.fromMs] : [ctx.fromMs, ctx.dbName],
  };
}

export function mapSlowOpRows(
  rows: SlowOpRow[],
  ctx: DbSourceCtx,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const row of rows) {
    for (const sample of row.recent_samples) {
      const endMs = sample.atTime.getTime();
      const startMs = endMs - sample.durationMs;
      if (!overlapsWindow(startMs, endMs, ctx.fromMs, ctx.toMs)) continue;
      events.push({
        id: `slow-op:${row.id}:${endMs}`,
        source: "slow-op",
        worktree: row.worktree,
        startMs,
        endMs,
        label: `${row.operation_kind} ${row.operation}`,
        severity: slowOpSeverity(sample.durationMs, row.threshold_ms),
        ...(sample.traceId !== undefined ? { traceId: sample.traceId } : {}),
        detail: {
          operationKind: row.operation_kind,
          operation: row.operation,
          durationMs: sample.durationMs,
          thresholdMs: row.threshold_ms,
          contention: sample.snapshot,
        },
      });
    }
  }
  return events;
}

export const slowOpsSource: DbSource = defineDbSource({
  source: "slow-op",
  build: buildSlowOpsQuery,
  row: RawSlowOpRowSchema,
  map: mapSlowOpRows,
});
