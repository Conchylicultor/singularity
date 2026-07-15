import { pathToFileURL } from "node:url";
import { getConfig, watchConfig } from "@plugins/config_v2/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { sentinelConfig } from "../../core";
import type { DetectorThresholds } from "./detector";
import type {
  MainToWorkerFrame,
  WorkerInitFrame,
  WorkerThresholdsFrame,
  WorkerToMainFrame,
} from "./worker/protocol";

// Main-side host for the sentinel worker: spawns/supervises the Bun Worker,
// pushes live config, and relays its frames to the re-emitters (sampler.ts /
// onset.ts). Main is deliberately NOT on the latch's critical path — the
// worker owns sampler + detector + latch lifecycle entirely (Stage 5,
// research/2026-07-11-global-observability-freeze-blind-spots.md).

/** Respawn backoff after a worker death: start here, double up to the cap. */
const RESPAWN_BACKOFF_MIN_MS = 1_000;
const RESPAWN_BACKOFF_MAX_MS = 30_000;
/**
 * A worker that dies this fast never got going (e.g. its module graph does
 * not resolve — a compiled release binary without the worker entry embedded).
 * After MAX_RAPID_FAILURES such deaths in a row, give up with one loud line
 * instead of respawn-looping forever.
 */
const RAPID_EXIT_MS = 2_000;
const MAX_RAPID_FAILURES = 5;
/** How long stop() waits for the worker's `stopped` ack before terminating. */
const STOP_ACK_TIMEOUT_MS = 2_000;

export interface WorkerFrameHandlers {
  onSample: (frame: Extract<WorkerToMainFrame, { type: "sample" }>) => void;
  onTrip: (frame: Extract<WorkerToMainFrame, { type: "trip" }>) => void;
  onClear: (frame: Extract<WorkerToMainFrame, { type: "clear" }>) => void;
  onLog: (line: string, stream?: "stdout" | "stderr") => void;
}

interface HostState {
  handlers: WorkerFrameHandlers;
  worker: Worker | null;
  stopping: boolean;
  stoppedAck: (() => void) | null;
  respawnTimer: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
  rapidFailures: number;
  spawnedAt: number;
  configWatch: { dispose(): void } | null;
  latestConfigFrame: Omit<WorkerThresholdsFrame, "type"> | null;
}

let state: HostState | null = null;

// The config values satisfy DetectorThresholds structurally; this strips the
// extra config fields (enabled, cadenceMs, …) off the wire frame.
function pickThresholds(cfg: DetectorThresholds): DetectorThresholds {
  return {
    onLoadRatio: cfg.onLoadRatio,
    onLocksWaiting: cfg.onLocksWaiting,
    onBlkReadDeltaMs: cfg.onBlkReadDeltaMs,
    onBackendP99Ms: cfg.onBackendP99Ms,
    onSlowBackends: cfg.onSlowBackends,
    onDecompressionsPerSec: cfg.onDecompressionsPerSec,
    onTicks: cfg.onTicks,
    offRatio: cfg.offRatio,
    offTicks: cfg.offTicks,
  };
}

function dispatch(s: HostState, frame: WorkerToMainFrame): void {
  switch (frame.type) {
    case "sample":
      s.handlers.onSample(frame);
      break;
    case "trip":
      s.handlers.onTrip(frame);
      break;
    case "clear":
      s.handlers.onClear(frame);
      break;
    case "log":
      s.handlers.onLog(frame.line, frame.stream);
      break;
    case "ready":
      // Healthy spawn: reset the rapid-failure give-up counter.
      s.rapidFailures = 0;
      s.backoffMs = RESPAWN_BACKOFF_MIN_MS;
      break;
    case "stopped":
      s.stoppedAck?.();
      break;
  }
}

function scheduleRespawn(s: HostState): void {
  if (s.stopping || s.respawnTimer) return;
  const rapid = Date.now() - s.spawnedAt < RAPID_EXIT_MS;
  s.rapidFailures = rapid ? s.rapidFailures + 1 : 0;
  if (s.rapidFailures >= MAX_RAPID_FAILURES) {
    // Loud give-up, not a silent absence: the sentinel (and the duress latch
    // with it) is down until the underlying cause is fixed.
    s.handlers.onLog(
      `sentinel worker died ${String(MAX_RAPID_FAILURES)} times within ${String(RAPID_EXIT_MS)}ms of spawn — giving up. The cluster sentinel and duress latch are NOT running.`,
      "stderr",
    );
    return;
  }
  s.handlers.onLog(
    `sentinel worker died — respawning in ${String(s.backoffMs)}ms`,
    "stderr",
  );
  s.respawnTimer = setTimeout(() => {
    s.respawnTimer = null;
    if (!s.stopping) spawn(s);
  }, s.backoffMs);
  s.backoffMs = Math.min(s.backoffMs * 2, RESPAWN_BACKOFF_MAX_MS);
}

/**
 * Resolve the worker module URL.
 *
 * Dev (backend runs from source): the `new URL("./worker/entry.ts",
 * import.meta.url)` form resolves against this file's on-disk location.
 *
 * Compiled release: `bun build --compile` does NOT trace/embed a
 * `new Worker(new URL(...))` entry (verified Bun 1.3.13), so release.ts vendors
 * the worker as a standalone bundled `.js` on disk and launch.ts points
 * `SINGULARITY_SENTINEL_WORKER_JS` at it — the same vendored-asset pattern as
 * `SINGULARITY_PARCEL_WATCHER_NODE`. When set, spawn from that file.
 */
function resolveWorkerUrl(): URL {
  const vendored = process.env.SINGULARITY_SENTINEL_WORKER_JS;
  return vendored
    ? pathToFileURL(vendored)
    : new URL("./worker/entry.ts", import.meta.url);
}

function spawn(s: HostState): void {
  const cfg = getConfig(sentinelConfig);
  const worker = new Worker(resolveWorkerUrl());
  s.worker = worker;
  s.spawnedAt = Date.now();

  worker.onmessage = (event: MessageEvent) => {
    dispatch(s, event.data as WorkerToMainFrame);
  };
  worker.addEventListener("error", (event: ErrorEvent) => {
    s.handlers.onLog(`sentinel worker error: ${event.message}`, "stderr");
  });
  // Bun fires `close` when the worker exits for any reason — the one
  // supervision point. A respawned worker adopts a fresh existing latch at
  // init (reads it, seeds tripped, keeps refreshing), so a mid-episode crash
  // misses refreshes for ≪ the 60s lease.
  worker.addEventListener("close", () => {
    if (s.worker === worker) s.worker = null;
    scheduleRespawn(s);
  });

  const init: WorkerInitFrame = {
    type: "init",
    worktree: currentWorktreeName(),
    cadenceMs: cfg.cadenceMs,
    thresholds: s.latestConfigFrame?.thresholds ?? pickThresholds(cfg),
    maxEpisodeHoldMs: s.latestConfigFrame?.maxEpisodeHoldMs ?? cfg.maxEpisodeHoldMs,
  };
  worker.postMessage(init);
}

export function startSentinelWorker(handlers: WorkerFrameHandlers): void {
  if (state) return;
  const s: HostState = {
    handlers,
    worker: null,
    stopping: false,
    stoppedAck: null,
    respawnTimer: null,
    backoffMs: RESPAWN_BACKOFF_MIN_MS,
    rapidFailures: 0,
    spawnedAt: 0,
    configWatch: null,
    latestConfigFrame: null,
  };
  state = s;
  spawn(s);
  // Live threshold tuning: the worker cannot getConfig (no plugin runtime),
  // so main watches and pushes. The watcher fires immediately with current
  // values and on every change; a wedged main only stales the thresholds —
  // the worker retains the last pushed values.
  s.configWatch = watchConfig(sentinelConfig, (values) => {
    s.latestConfigFrame = {
      thresholds: pickThresholds(values),
      maxEpisodeHoldMs: values.maxEpisodeHoldMs,
    };
    s.worker?.postMessage({ type: "config", ...s.latestConfigFrame });
  });
}

export async function stopSentinelWorker(): Promise<void> {
  const s = state;
  if (!s) return;
  state = null;
  s.stopping = true;
  s.configWatch?.dispose();
  if (s.respawnTimer) {
    clearTimeout(s.respawnTimer);
    s.respawnTimer = null;
  }
  const worker = s.worker;
  if (!worker) return;
  // Graceful stop: the worker clears the latch if tripped (writing the clear
  // episode line) and acks; then we terminate either way.
  let ackTimer: ReturnType<typeof setTimeout> | null = null;
  const acked = new Promise<void>((resolve) => {
    s.stoppedAck = resolve;
    ackTimer = setTimeout(resolve, STOP_ACK_TIMEOUT_MS);
  });
  worker.postMessage({ type: "stop" } satisfies MainToWorkerFrame);
  await acked;
  if (ackTimer) clearTimeout(ackTimer);
  worker.terminate();
}
