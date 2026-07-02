import {
  captureFlightWindow,
  readGateGauges,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import type { SlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { getContentionSnapshot } from "@plugins/infra/plugins/contention/server";
import type { ConfigValues } from "@plugins/config_v2/core";
import type { flightRecorderConfig } from "../../core";
import { admitSnapshot } from "./rate-limit";
import { buildSnapshot } from "./build-snapshot";
import { persistSnapshot } from "./persist";

export type FlightCfg = ConfigValues<(typeof flightRecorderConfig)["fields"]>;

// Runs SYNCHRONOUSLY in the profiler hot path (via the onSlowSpan handler) —
// it must only schedule, never block or throw.
export function tripAndPersist(
  span: SlowSpan,
  thresholdMs: number,
  cfg: FlightCfg,
): void {
  // Admission first, so a slow-event storm costs one Map lookup per slow span.
  if (!admitSnapshot(`${span.kind}:${span.label}`, span.atMs, cfg.cooldownMs, cfg.maxPerMin)) {
    return;
  }

  // SYNCHRONOUS coherent-instant capture — no await between these reads, so
  // the open spans and the gate occupancy describe the same instant.
  const windowStartMs = span.atMs - Math.max(span.durationMs, cfg.windowMs);
  const flight = captureFlightWindow({ windowStartMs });
  const gates = readGateGauges();

  // Async enrich + persist, fire-and-forget: detaching the promise keeps the
  // profiler hot path non-blocking, and a failure surfaces as an unhandled
  // rejection that the reports plugin captures and files — never silently
  // swallowed. Wrapped in runWithoutProfiling so the recorder's own IO
  // (contention pg query, JSONL write) never re-feeds the profiler.
  void runWithoutProfiling(async () => {
    const contention = await getContentionSnapshot();
    persistSnapshot(
      buildSnapshot(span, thresholdMs, windowStartMs, flight, gates, contention),
    );
  });
}
