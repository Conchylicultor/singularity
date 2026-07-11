import type { ClusterSample } from "../../../core";
import type { DetectorThresholds, SignalReadings } from "../detector";

// The frame protocol between the main-side worker host (worker-host.ts) and
// the sentinel worker (worker/entry.ts). Discriminated on `type`; every frame
// is structured-cloneable plain data.
//
// The worker owns the whole sampler + detector + latch lifecycle; main is a
// best-effort re-emitter. Nothing main-side is on the latch's critical path —
// a wedged main only stales the thresholds (last values retained worker-side)
// and delays ring/trace mirroring (postMessage buffers; samples carry their
// own `wall`, so late delivery is harmless).

/** Detector + safety-bound values pushed from main's live config. */
export interface WorkerThresholdsFrame {
  type: "config";
  thresholds: DetectorThresholds;
  maxEpisodeHoldMs: number;
}

export interface WorkerInitFrame {
  type: "init";
  /** Worktree name == embedded-cluster DB name for the dedicated pg client. */
  worktree: string;
  /** Read once, like the main sampler always did (restart to change). */
  cadenceMs: number;
  thresholds: DetectorThresholds;
  maxEpisodeHoldMs: number;
}

export type MainToWorkerFrame =
  | WorkerInitFrame
  | WorkerThresholdsFrame
  | { type: "stop" }
  // Test-only: pins the gatherer to a synthetic sample. While set, every tick
  // processes it instead of touching pg/gateway/ps/disk — so trip, per-tick
  // lease renewal, and clear are deterministic in a real-Worker bun test.
  | { type: "__sample"; sample: ClusterSample };

export type WorkerToMainFrame =
  | { type: "ready" }
  | { type: "sample"; sample: ClusterSample }
  | {
      type: "trip";
      runUpMs: number;
      signals: SignalReadings;
      elevated: string[];
      wall: number;
    }
  | { type: "clear"; forced: boolean }
  | { type: "log"; line: string; stream?: "stdout" | "stderr" }
  | { type: "stopped" };
