import { getConfig } from "@plugins/config_v2/server";
import { captureTrace } from "@plugins/debug/plugins/trace/plugins/engine/server";
import {
  clearDuress,
  refreshDuress,
  setDuress,
} from "@plugins/infra/plugins/duress/server";
import { Log, type LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { sentinelConfig } from "../../core";
import type { ClusterSample } from "../../core";
import { createOnsetDetector, type OnsetDetector } from "./detector";
import { onSentinelSample } from "./sampler";

// Wires the pure onset detector to the world: subscribes to the sampler's
// per-tick feed, and on transitions fires the cluster-onset trace and drives
// the duress latch (set on trip, mtime-refresh every tick while tripped so the
// 60s freshness lease never lapses mid-episode, clear on clear).

/** Extra lookback added to the run-up so the trace window shows the prologue. */
const ONSET_WINDOW_PAD_MS = 60_000;

let unsubscribe: (() => void) | null = null;
let detector: OnsetDetector | null = null;
let channel: LogChannel | null = null;

function onSample(sample: ClusterSample): void {
  if (!detector) return;
  const cfg = getConfig(sentinelConfig);
  const event = detector.feed(sample, cfg, cfg.cadenceMs);

  if (detector.tripped && event === null) {
    // Mid-episode tick: keep the latch's freshness lease alive.
    refreshDuress();
    return;
  }
  if (event === null) return;

  if (event.kind === "trip") {
    // critical: bypasses the global per-minute cap (the onset trace must land
    // even mid-storm); the per-kind cooldown still dedupes. The widened
    // durationMs widens the persisted window to cover the elevation run-up.
    const trace = captureTrace({
      kind: "cluster-onset",
      label: "cluster",
      critical: true,
      durationMs: event.runUpMs + ONSET_WINDOW_PAD_MS,
      thresholdMs: 0,
      detail: { signals: event.signals, elevated: event.elevated },
    });
    setDuress(`cluster-onset: ${event.elevated.join(", ")}`);
    channel?.publish(
      `onset TRIP (${event.elevated.join(", ")}) trace=${trace?.id ?? "rate-limited"}`,
    );
  } else {
    clearDuress();
    channel?.publish("onset CLEAR");
  }
}

export function startOnsetDetector(): void {
  if (unsubscribe) return;
  detector = createOnsetDetector();
  channel = Log.channel("sentinel", { persist: true });
  unsubscribe = onSentinelSample(onSample);
}

export function stopOnsetDetector(): void {
  unsubscribe?.();
  unsubscribe = null;
  // A stopping sentinel must not leave the fleet latched: the lease would
  // expire in 60s anyway, but an explicit clear removes the window entirely.
  if (detector?.tripped) clearDuress();
  detector = null;
}
