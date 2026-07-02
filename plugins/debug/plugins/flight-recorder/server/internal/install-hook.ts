import { onSlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { SlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  resolveSlowThreshold,
  type Thresholds,
} from "@plugins/debug/plugins/slow-ops/server";
import { tripAndPersist, type FlightCfg } from "./trip";

// The current onSlowSpan subscription. Reinstalled on every config change so
// the perf-floor (the static `thresholdMs` guard) tracks the lowest configured
// threshold. The handler closure reads the LATEST config pair (captured per
// (re)install) and does the final per-kind gating.
let disposer: { dispose(): void } | null = null;

export function installFlightHook(thresholds: Thresholds, cfg: FlightCfg): void {
  // Dispose the prior subscription before creating a new one so config changes
  // never leave a stale hook installed.
  if (disposer) {
    disposer.dispose();
    disposer = null;
  }

  // When disabled, skip installation entirely — the profiler never calls us.
  if (!cfg.enabled) return;

  // Perf floor: the profiler only calls back for spans at least this long, so
  // a fast span never reaches our handler. The handler then applies the
  // precise per-kind threshold — the SAME resolver as slow-ops, so a snapshot
  // exists exactly when a slow-op row does.
  const floor = Math.min(
    thresholds.loaderMs,
    thresholds.httpMs,
    thresholds.dbMs,
    thresholds.jobMs,
  );

  // The handler runs SYNCHRONOUSLY in the profiler hot path — it must only
  // schedule, never block or throw.
  disposer = onSlowSpan(
    (span: SlowSpan) => {
      const threshold = resolveSlowThreshold(span, thresholds);
      if (span.durationMs < threshold) return;
      tripAndPersist(span, threshold, cfg);
    },
    { thresholdMs: floor },
  );
}
