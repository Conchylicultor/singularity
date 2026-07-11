import { getConfig } from "@plugins/config_v2/server";
import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import {
  Log,
  type LogChannel,
} from "@plugins/primitives/plugins/log-channels/server";
import { sentinelConfig } from "../../core";
import type { ClusterSample } from "../../core";
import { clusterClass } from "./cluster-class";
import { handleClearFrame, handleTripFrame } from "./onset";
import { startSentinelWorker, stopSentinelWorker } from "./worker-host";

// The cluster congestion sentinel — main-only, always-on.
//
// Since Stage 5 (research/2026-07-11-global-observability-freeze-blind-spots.md)
// the sampling loop, the onset detector, AND the duress-latch lifecycle all
// live on a dedicated Bun Worker thread (worker/entry.ts, spawned/supervised
// by worker-host.ts). This module is main's best-effort re-emitter: it relays
// the worker's sample frames into the `cluster` trace ring and the listener
// registry, its trip/clear frames into the onset re-emitter (captureTrace +
// log), and its log frames into the `sentinel` channel (single writer per
// channel file — the worker never writes this one). Nothing here is on the
// latch's critical path: a wedged main delays mirroring, never the lease.
//
// Why the worker ticks on a setInterval and NOT a defineJob / graphile cron
// task: the sentinel is the diagnostic instrument FOR cluster duress. Routing
// it through the job queue (which runs on an event loop and a DB that the
// congestion it measures saturates) would mean the onset it exists to observe
// silently starves it. graphile cron's 1-minute floor is also far too coarse
// for a ~5s cadence. Mirrors health-monitor/server/internal/process-sampler.ts
// (the recorded exception to the no-polling rule).

let running = false;
let channel: LogChannel | null = null;

// The onset detector consumed this registry when it lived on main; it now
// feeds any main-side consumer of the per-tick samples. Kept so the sample
// feed's shape survives the worker move.
type SampleListener = (sample: ClusterSample) => void;
const listeners = new Set<SampleListener>();
export function onSentinelSample(listener: SampleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startSentinelSampler(): void {
  if (running) return;
  const cfg = getConfig(sentinelConfig);
  if (!cfg.enabled) return;
  running = true;
  channel = Log.channel("sentinel", { persist: true });
  startSentinelWorker({
    // Re-emits run under the background lane with profiling suppressed, like
    // the old in-loop tick: the sentinel's own mirroring must never feed the
    // profiler or ride the interactive lane.
    onSample: (frame) => {
      runInBackgroundLane(() =>
        runWithoutProfiling(() => {
          clusterClass.emit({ tMs: performance.now(), data: frame.sample });
          for (const listener of listeners) listener(frame.sample);
        }),
      );
    },
    onTrip: (frame) => {
      runInBackgroundLane(() => runWithoutProfiling(() => handleTripFrame(frame)));
    },
    onClear: (frame) => {
      runInBackgroundLane(() => runWithoutProfiling(() => handleClearFrame(frame)));
    },
    onLog: (line, stream) => {
      channel?.publish(line, stream);
    },
  });
}

export function stopSentinelSampler(): Promise<void> {
  if (!running) return Promise.resolve();
  running = false;
  listeners.clear();
  return stopSentinelWorker();
}
