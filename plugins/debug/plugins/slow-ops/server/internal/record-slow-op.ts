import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  runWithoutProfiling,
  type SpanRef,
  type WaitBreakdown,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { recordReport } from "@plugins/reports/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import {
  getContentionSnapshot,
  type ContentionSnapshot,
} from "@plugins/infra/plugins/contention/server";
import type { CallerBreakdown, SlowOpMarker, SlowOpSample } from "../../core";

// The only two report sources a slow-op originates from. Kept as a local literal
// union rather than imported, since reports' ReportSource lives in its private
// `shared/` (cross-plugin shared imports are forbidden); recordReport validates
// the value against its own source enum at ingest regardless.
type SlowOpSource = "server-slow-op" | "client-slow-op";
import { _slowOps } from "./tables";
import { slowOpsResource } from "./resources";

// A slim overlay marker per recorded slow op, dual-written to a persisted log
// channel. Mirrors the health sampler's `Log.channel("health", { persist: true })`
// — each worktree backend writes to its own logs/slow-op-markers.jsonl, read
// from disk by the health-monitor endpoint to draw spike lines on the charts.
// Uncapped (one line per slow op), unlike the 10-entry DB recentSamples ring.
const markerChannel = Log.channel("slow-op-markers", { persist: true });

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
  // Per-layer wait charged to this entry span (gate/lock → ms), when it waited.
  // Merged per layer into the row's durable `waits` so the wait-vs-work split
  // survives restart. Only entry spans (loader/http/sub/push) carry it.
  waits?: WaitBreakdown;
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

// Sum an incoming per-layer wait map into the existing one (layer → total ms).
// A plain additive merge mirroring the aggregate's wait accumulation.
function mergeWaits(
  existing: WaitBreakdown,
  incoming: WaitBreakdown,
): WaitBreakdown {
  const next: WaitBreakdown = { ...existing };
  for (const layer in incoming) {
    next[layer] = (next[layer] ?? 0) + incoming[layer]!;
  }
  return next;
}

// Prepend the new contention sample and cap the ring at the newest 10. Mirrors
// the `callers` read-modify-write merge, but a plain bounded prepend (no
// dedupe) — each sample is a distinct point-in-time capture.
function mergeSample(
  samples: SlowOpSample[],
  snapshot: ContentionSnapshot,
  durationMs: number,
): SlowOpSample[] {
  return [{ atTime: new Date(), durationMs, snapshot }, ...samples].slice(0, 10);
}

// THE single ingest funnel for every slow-op signal — the server span hook and
// the client endpoint both collapse here. Upserts the deduped aggregate by
// (operationKind, operation, worktree), merges the caller attribution, notifies
// the live resource, and fires the singleton rollup report (fire-and-forget so
// a slow report path never blocks recording). Failures propagate loudly.
export async function recordSlowOp(input: RecordSlowOpInput): Promise<void> {
  const { operationKind, operation, durationMs, thresholdMs, source, parent, waits } =
    input;
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";

  // One transaction so the onConflictDoUpdate row lock serializes concurrent
  // callers for the same key, making the callers read-merge-write race-tolerant.
  // Wrapped in runWithoutProfiling: the slow_ops upsert is itself a `db` span that
  // would otherwise re-feed the slow-op recorder (self-amplifying loop). The
  // suppression ALS propagates through every awaited query inside the callback.
  // Hoisted out of the suppression callback so the dual-write marker below can
  // reuse the same captured box state. Assigned inside the scope (the await must
  // stay there); non-null after the callback resolves.
  let snapshot!: ContentionSnapshot;
  await runWithoutProfiling(async () => {
    // Capture the box state at the instant this span tripped. Cached (≤1s) so a
    // storm of slow ops collapses onto one read; inside runWithoutProfiling so
    // its own pg query never re-feeds this recorder. The await MUST stay inside
    // the suppression scope (same reason as the transaction below).
    snapshot = await getContentionSnapshot();

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

      // A second read-modify-write within the same row-locked transaction so
      // both ring merges stay race-safe. recentSamples is ALWAYS updated (every
      // slow op gets a contention sample); callers is merged additionally only
      // when a parent span is known (client signals pass null).
      const callers = parent
        ? mergeCaller(row.callers, parent, durationMs)
        : row.callers;
      const nextWaits = waits ? mergeWaits(row.waits, waits) : row.waits;
      const recentSamples = mergeSample(
        row.recentSamples,
        snapshot,
        durationMs,
      );
      await tx
        .update(_slowOps)
        .set({ callers, waits: nextWaits, recentSamples })
        .where(eq(_slowOps.id, row.id));
    });
  });

  slowOpsResource.notify();

  // Dual-write a slim marker for the health-monitor overlay (one line per
  // recorded slow op). The snapshot was captured inside the suppression scope
  // above; reuse it so the marker shares the box state the aggregate recorded.
  markerChannel.publish(
    JSON.stringify({
      atTime: new Date(),
      durationMs,
      operationKind,
      operation,
      loadAvg1: snapshot.loadAvg1,
      cpuCount: snapshot.cpuCount,
    } satisfies SlowOpMarker),
  );

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
