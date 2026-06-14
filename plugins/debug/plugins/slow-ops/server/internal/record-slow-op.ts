import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  runWithoutProfiling,
  type SpanRef,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { recordReport } from "@plugins/reports/server";
import type { CallerBreakdown } from "../../core";

// The only two report sources a slow-op originates from. Kept as a local literal
// union rather than imported, since reports' ReportSource lives in its private
// `shared/` (cross-plugin shared imports are forbidden); recordReport validates
// the value against its own source enum at ingest regardless.
type SlowOpSource = "server-slow-op" | "client-slow-op";
import { _slowOps } from "./tables";
import { slowOpsResource } from "./resources";

export interface RecordSlowOpInput {
  operationKind: string;
  operation: string;
  durationMs: number;
  thresholdMs: number;
  // The report source attributed to the rollup report (server-slow-op vs
  // client-slow-op). The funnel doesn't infer it — the caller knows its origin.
  source: SlowOpSource;
  // The immediate enclosing request/loader span, when known (server spans). The
  // caller-attribution fix: this is what the whole refactor exists to capture.
  // Client signals (page-load, element) have no parent and pass null.
  parent?: SpanRef | null;
}

// Merge a caller (parent span) into the existing breakdown list: bump an
// existing entry matched by (kind,label), else append a fresh one.
function mergeCaller(
  callers: CallerBreakdown[],
  parent: SpanRef,
  durationMs: number,
): CallerBreakdown[] {
  const next = callers.map((c) => ({ ...c }));
  const existing = next.find(
    (c) => c.kind === parent.kind && c.label === parent.label,
  );
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    if (durationMs > existing.maxMs) existing.maxMs = durationMs;
  } else {
    next.push({
      kind: parent.kind,
      label: parent.label,
      count: 1,
      totalMs: durationMs,
      maxMs: durationMs,
    });
  }
  return next;
}

// THE single ingest funnel for every slow-op signal — the server span hook and
// the client endpoint both collapse here. Upserts the deduped aggregate by
// (operationKind, operation, worktree), merges the caller attribution, notifies
// the live resource, and fires the singleton rollup report (fire-and-forget so
// a slow report path never blocks recording). Failures propagate loudly.
export async function recordSlowOp(input: RecordSlowOpInput): Promise<void> {
  const { operationKind, operation, durationMs, thresholdMs, source, parent } =
    input;
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";

  // One transaction so the onConflictDoUpdate row lock serializes concurrent
  // callers for the same key, making the callers read-merge-write race-tolerant.
  // Wrapped in runWithoutProfiling: the slow_ops upsert is itself a `db` span that
  // would otherwise re-feed the slow-op recorder (self-amplifying loop). The
  // suppression ALS propagates through every awaited query inside the callback.
  await runWithoutProfiling(async () => {
    // The await MUST run inside the suppression scope. A bare `() => db…`
    // returns the lazy query unexecuted, so its execution (and the acquire +
    // query spans the pool wrapper records) would run after the ALS scope exits
    // — defeating suppression and re-opening the self-feedback loop.
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(_slowOps)
        .values({
          worktree,
          operationKind,
          operation,
          count: 1,
          totalMs: durationMs,
          maxMs: durationMs,
          lastMs: durationMs,
          thresholdMs,
          callers: [],
        })
        .onConflictDoUpdate({
          target: [_slowOps.operationKind, _slowOps.operation, _slowOps.worktree],
          set: {
            count: sql`${_slowOps.count} + 1`,
            totalMs: sql`${_slowOps.totalMs} + ${durationMs}`,
            maxMs: sql`greatest(${_slowOps.maxMs}, ${durationMs})`,
            lastMs: durationMs,
            thresholdMs,
            lastSeenAt: new Date(),
          },
        })
        .returning();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (!row) throw new Error("recordSlowOp: upsert returned no row");

      if (parent) {
        const callers = mergeCaller(row.callers, parent, durationMs);
        await tx
          .update(_slowOps)
          .set({ callers })
          .where(eq(_slowOps.id, row.id));
      }
    });
  });

  slowOpsResource.notify();

  // Fire-and-forget the singleton rollup report. The fixed fingerprint collapses
  // every slow-op onto one task; its message reflects the latest tripping op.
  const durationRounded = Math.round(durationMs);
  void recordReport({
    kind: "slow-op",
    source,
    data: { operationKind, operation, durationMs, thresholdMs },
    message: `${operationKind} ${operation} took ${durationRounded}ms (threshold ${thresholdMs}ms)`,
  });
}
