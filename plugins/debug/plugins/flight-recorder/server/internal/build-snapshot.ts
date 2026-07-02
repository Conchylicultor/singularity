import type {
  FlightWindow,
  GateGauge,
  SlowSpan,
} from "@plugins/infra/plugins/runtime-profiler/core";
import type { ContentionSnapshot } from "@plugins/infra/plugins/contention/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";

// Assemble the one-line snapshot JSON (schema v1). `atMs` values are on the
// profiler clock; `wallTime` is the wall-clock join key against
// stall-profiles.jsonl / health.jsonl / slow-op markers.
export function buildSnapshot(
  span: SlowSpan,
  thresholdMs: number,
  windowStartMs: number,
  flight: FlightWindow,
  gates: Record<string, GateGauge>,
  contention: ContentionSnapshot,
): object {
  return {
    v: 1,
    atMs: span.atMs,
    wallTime: new Date().toISOString(),
    worktree: currentWorktreeName(),
    trip: {
      kind: span.kind,
      label: span.label,
      durationMs: span.durationMs,
      thresholdMs,
      parent: span.parent,
      waitMs: span.waitMs,
      childMs: span.childMs,
      selfMs: span.selfMs,
      waits: span.waits,
    },
    windowStartMs,
    open: flight.open,
    completed: flight.completed,
    gates,
    contention,
  };
}
