import { onSlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { SlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { captureTrace } from "@plugins/debug/plugins/trace/plugins/engine/server";
import { recordSlowOp } from "./record-slow-op";
import {
  perfFloorMs,
  resolveSlowThreshold,
  slowSpanMs,
  type Thresholds,
} from "./resolve-threshold";

// The current onSlowSpan subscription. Reinstalled on every config change so the
// perf-floor (the static `thresholdMs` guard) tracks the lowest configured
// threshold. The handler closure reads the LATEST thresholds object (captured
// per (re)install) and does the final per-kind gating.
let disposer: { dispose(): void } | null = null;

export function installSlowSpanHook(thresholds: Thresholds): void {
  // Dispose the prior subscription before creating a new one so config changes
  // never leave a stale hook installed.
  if (disposer) {
    disposer.dispose();
    disposer = null;
  }

  // Perf floor: the profiler only calls back for spans at least this long, so a
  // fast span never reaches our handler. The handler then applies the precise
  // per-kind threshold. Config knobs are no longer the only source of
  // thresholds — a job's bar is its hold class's ceiling — so the floor is
  // computed where both live (`perfFloorMs`), never re-derived here.
  const floor = perfFloorMs(thresholds);

  // The handler runs SYNCHRONOUSLY in the profiler hot path — it must only
  // schedule, never block or throw.
  disposer = onSlowSpan(
    (span: SlowSpan) => {
      const threshold = resolveSlowThreshold(span, thresholds);
      // Wall-clock for every kind except `job`, which is judged on work time
      // (`durationMs − waitMs`) — see `slowSpanMs`. A job's slot-hold is
      // substantially not a property of the job: `jobs.dead-gc` was measured
      // holding a worker slot 77 s to do 254 ms of work, the rest blocked on an
      // admission gate entered AFTER graphile had handed it a slot. Comparing
      // hold would file a report against a correctly-classified job every time
      // that gate got busy.
      if (slowSpanMs(span) < threshold) return;
      // 1. Evidence FIRST, synchronously: captureTrace's admission + the sync
      // coherent-instant capture must run before any await so the flight window
      // (open spans, gate occupancy) describes THIS trip's instant. Admission is
      // one Map lookup per slow span in a storm; enrich + persist detach inside.
      // Returns the minted trace id (for linkage) or null when rate-limited /
      // disabled — never throws into this profiler hot path.
      const trace = captureTrace({
        kind: span.kind,
        label: span.label,
        durationMs: span.durationMs,
        thresholdMs: threshold,
        detail: {
          // The tripping span's per-instance id: the captured flight window
          // contains this exact run (the ring write precedes this notify), so a
          // reader can root the call tree at it rather than guessing by label.
          spanId: span.id,
          parent: span.parent,
          waits: span.waits,
          waitMs: span.waitMs,
          childMs: span.childMs,
          selfMs: span.selfMs,
        },
      });
      // 2. Aggregate + report — the existing funnel, now stamped with the link.
      // Fire-and-forget: detaching the promise keeps the profiler hot path
      // non-blocking, and a failed recordSlowOp surfaces as an unhandled
      // rejection that the reports plugin captures and files — never silently
      // swallowed. `span.parent` carries the caller attribution this refactor
      // exists to capture.
      // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- observability write: recordSlowOp persists via its own background-lane/suppressed path; must stay profiler-invisible
      void recordSlowOp({
        operationKind: span.kind,
        operation: span.label,
        durationMs: span.durationMs,
        thresholdMs: threshold,
        source: "server-slow-op",
        caller: span.parent,
        waits: span.waits,
        traceId: trace?.id,
      });
    },
    { thresholdMs: floor },
  );
}
