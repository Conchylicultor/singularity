import { captureTrace } from "@plugins/debug/plugins/trace/plugins/engine/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import type { WorkerToMainFrame } from "./worker/protocol";

// Main's best-effort re-emitter for the worker's onset transitions (Stage 5:
// the detector AND the duress latch live on the sentinel worker — see
// worker/entry.ts). On trip, mirror the event into the durable trace store;
// on clear, log. Deliberately nothing else: main is NOT on the latch's
// critical path, so a wedged main can only delay these mirrors, never the
// lease. ALL setDuress/refreshDuress/clearDuress calls are gone from main —
// the worker is the single latch owner.

/** Extra lookback added to the run-up so the trace window shows the prologue. */
const ONSET_WINDOW_PAD_MS = 60_000;

const channel = Log.channel("sentinel", { persist: true });

export function handleTripFrame(
  frame: Extract<WorkerToMainFrame, { type: "trip" }>,
): void {
  // critical: bypasses the global per-minute cap (the onset trace must land
  // even mid-storm); the per-kind cooldown still dedupes. The widened
  // durationMs widens the persisted window to cover the elevation run-up.
  const trace = captureTrace({
    kind: "cluster-onset",
    label: "cluster",
    critical: true,
    durationMs: frame.runUpMs + ONSET_WINDOW_PAD_MS,
    thresholdMs: 0,
    detail: { signals: frame.signals, elevated: frame.elevated },
  });
  channel.publish(
    `onset TRIP (${frame.elevated.join(", ")}) trace=${trace?.id ?? "rate-limited"}`,
  );
}

export function handleClearFrame(
  frame: Extract<WorkerToMainFrame, { type: "clear" }>,
): void {
  channel.publish(
    frame.forced ? "onset CLEAR (max-episode-hold forced)" : "onset CLEAR",
  );
}
