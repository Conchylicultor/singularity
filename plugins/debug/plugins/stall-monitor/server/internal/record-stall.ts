import { captureTrace } from "@plugins/debug/plugins/trace/plugins/engine/server";
import { recordReport } from "@plugins/reports/server";
import type { StallSection } from "@plugins/debug/plugins/trace/plugins/stall/core";
import { deriveCulprit } from "./culprit";

// The alert side of an event-loop stall. health-monitor's sampler DETECTS +
// AGGREGATES the freeze (it drains the JSC profiler and builds the StallSection);
// it then hands the section here via a direct barrel call. This plugin owns BOTH
// the trace (evidence) and the report (alert) for a stall — exactly how op-rate's
// op-time kind owns both — so a frozen backend reaches the bell + Debug → Reports,
// linked to its trace. A direct call (not a defineReportSink fan-out) is correct:
// the consumer set is closed and singular, and health-monitor may hard-depend on
// this plugin. Mirrors op-rate / slow-ops, which call captureTrace + recordReport
// directly.
export function recordEventLoopStall(
  section: StallSection,
  durationMs: number,
  thresholdMs: number,
): void {
  const { culpritStack, hotFrame } = deriveCulprit(section);

  // Evidence first — captureTrace mints the id synchronously (before persist) and
  // never throws. Pass the STABLE `culpritStack` as the label: `label` is part of
  // the engine's kind:label admission/cooldown key, so a varying per-tick label
  // would defeat trace-side dedup across the ticks of one sustained freeze.
  const trace = captureTrace({
    kind: "stall",
    label: culpritStack,
    durationMs,
    thresholdMs,
    critical: true,
    detail: section,
  });

  // Plain `void` — recordReport already wraps its own DB/bell writes in
  // runInBackgroundLane(runWithoutProfiling(…)) internally, so the caller must NOT
  // double-wrap (precedent: reports' setErrorReporter does `void recordReport(…)`
  // from a sync callback). Satisfies no-floating-promises; no catch (no-bare-catch).
  void recordReport({
    kind: "event-loop-stall",
    source: "server-stall-monitor",
    data: {
      durationMs,
      thresholdMs,
      nSamples: section.nSamples,
      sampleRateHz: section.sampleRateHz,
      culprit: hotFrame,
      culpritStack,
      hotFrame,
      topLeaves: section.topLeaves,
      topStacks: section.topStacks,
      ...(trace ? { traceId: trace.id } : {}),
    },
    message: `Event-loop stall ${Math.round(durationMs)}ms — ${hotFrame}`,
  });
}
