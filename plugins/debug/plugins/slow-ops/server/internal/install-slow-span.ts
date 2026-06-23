import { onSlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { SlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { ConfigValues } from "@plugins/config_v2/core";
import { recordSlowOp } from "./record-slow-op";
import type { slowOpConfig } from "../../core";

type Thresholds = ConfigValues<(typeof slowOpConfig)["fields"]>;

// The current onSlowSpan subscription. Reinstalled on every config change so the
// perf-floor (the static `thresholdMs` guard) tracks the lowest configured
// threshold. The handler closure reads the LATEST thresholds object (captured
// per (re)install) and does the final per-kind gating.
let disposer: { dispose(): void } | null = null;

// Map a span kind to its configured threshold. The `sub`/`push` origin entries
// and the `flush` notify-flush cycle all wrap loaders, so they share the loader
// threshold (no separate config knob).
function thresholdFor(kind: SlowSpan["kind"], t: Thresholds): number {
  switch (kind) {
    case "http":
      return t.httpMs;
    case "db":
      return t.dbMs;
    case "loader":
    case "sub":
    case "push":
    case "flush":
      return t.loaderMs;
  }
}

export function installSlowSpanHook(thresholds: Thresholds): void {
  // Dispose the prior subscription before creating a new one so config changes
  // never leave a stale hook installed.
  if (disposer) {
    disposer.dispose();
    disposer = null;
  }

  // Perf floor: the profiler only calls back for spans at least this long, so a
  // fast span never reaches our handler. The handler then applies the precise
  // per-kind threshold.
  const floor = Math.min(
    thresholds.loaderMs,
    thresholds.httpMs,
    thresholds.dbMs,
  );

  // The handler runs SYNCHRONOUSLY in the profiler hot path — it must only
  // schedule, never block or throw.
  disposer = onSlowSpan(
    (span: SlowSpan) => {
      const threshold = thresholdFor(span.kind, thresholds);
      if (span.durationMs < threshold) return;
      // Fire-and-forget: detaching the promise keeps the profiler hot path
      // non-blocking, and a failed recordSlowOp surfaces as an unhandled
      // rejection that the reports plugin captures and files — never silently
      // swallowed. `span.parent` carries the caller attribution this refactor
      // exists to capture.
      void recordSlowOp({
        operationKind: span.kind,
        operation: span.label,
        durationMs: span.durationMs,
        thresholdMs: threshold,
        source: "server-slow-op",
        caller: span.parent,
        waits: span.waits,
      });
    },
    { thresholdMs: floor },
  );
}
