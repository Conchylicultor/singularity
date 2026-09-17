import { namespaceArgv } from "@plugins/infra/plugins/runtime-identity/core";
import { pathToFileURL } from "node:url";
import type { SentinelStatus } from "../../core";
import type {
  MainToWorkerFrame,
  WorkerInitFrame,
  WorkerThresholdsFrame,
  WorkerToMainFrame,
} from "./worker/protocol";

// Main-side host for the sentinel worker: spawns/supervises the Bun Worker,
// pushes live settings, relays its frames to the re-emitters (sampler.ts /
// onset.ts), and reports its supervision status. Main is deliberately NOT on
// the latch's critical path — the worker owns sampler + detector + latch
// lifecycle entirely (Stage 5,
// research/2026-07-11-global-observability-freeze-blind-spots.md).
//
// Config-free on purpose: the caller reads config and pushes it in, so this
// module can be driven by a test with a worker of its choosing.

/** Respawn backoff after a worker death: start here, double up to the cap. */
const RESPAWN_BACKOFF_MIN_MS = 1_000;
const RESPAWN_BACKOFF_MAX_MS = 30_000;
/**
 * A worker that dies this fast never got going (e.g. its module graph throws at
 * load). After MAX_RAPID_FAILURES such deaths in a row, give up — status `down`,
 * which the caller turns into a report and the health row — instead of
 * respawn-looping forever.
 */
const RAPID_EXIT_MS = 2_000;
export const MAX_RAPID_FAILURES = 5;
/** How long stop() waits for the worker's `stopped` ack before terminating. */
const STOP_ACK_TIMEOUT_MS = 2_000;

export interface WorkerFrameHandlers {
  onSample: (frame: Extract<WorkerToMainFrame, { type: "sample" }>) => void;
  onTrip: (frame: Extract<WorkerToMainFrame, { type: "trip" }>) => void;
  onClear: (frame: Extract<WorkerToMainFrame, { type: "clear" }>) => void;
  onLog: (line: string, stream?: "stdout" | "stderr") => void;
  /** Every supervision transition, in order, starting with `starting`. */
  onStatus: (status: SentinelStatus) => void;
}

/** What the worker is configured with; `cadenceMs` applies at spawn only. */
export type SentinelWorkerSettings = Omit<WorkerInitFrame, "type">;

export interface SentinelWorkerOptions {
  handlers: WorkerFrameHandlers;
  settings: SentinelWorkerSettings;
  /**
   * Which module to run, and with what environment. Defaults to the real
   * worker ({@link resolveWorkerUrl}) under this process's environment; a test
   * points it at a throwaway module or a temp data root.
   */
  worker?: { url: URL; env?: Record<string, string> };
  /** Respawn backoff bounds. Defaults to 1 s → 30 s; a test shortens them. */
  backoff?: { minMs: number; maxMs: number };
}

interface HostState {
  handlers: WorkerFrameHandlers;
  settings: SentinelWorkerSettings;
  workerUrl: URL;
  workerEnv: Record<string, string> | undefined;
  backoffBounds: { minMs: number; maxMs: number };
  worker: Worker | null;
  stopping: boolean;
  stoppedAck: (() => void) | null;
  respawnTimer: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
  rapidFailures: number;
  /** Deaths since the worker last reached `ready`. */
  deaths: number;
  /** The most recent `error` event's message since the last `ready`. */
  lastError: string | null;
  spawnedAt: number;
}

let state: HostState | null = null;

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
      // Healthy spawn: reset the give-up counters.
      s.rapidFailures = 0;
      s.deaths = 0;
      s.lastError = null;
      s.backoffMs = s.backoffBounds.minMs;
      s.handlers.onStatus({ state: "running", since: Date.now() });
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
  s.deaths += 1;
  if (s.rapidFailures >= MAX_RAPID_FAILURES) {
    // Loud give-up, not a silent absence: the sentinel (and the duress latch
    // with it) is down until the underlying cause is fixed.
    s.handlers.onLog(
      `sentinel worker died ${String(MAX_RAPID_FAILURES)} times within ${String(RAPID_EXIT_MS)}ms of spawn — giving up. The cluster sentinel and duress latch are NOT running. Last error: ${s.lastError ?? "(none reported)"}`,
      "stderr",
    );
    s.handlers.onStatus({
      state: "down",
      since: Date.now(),
      deaths: s.deaths,
      lastError: s.lastError,
    });
    return;
  }
  s.handlers.onLog(
    `sentinel worker died — respawning in ${String(s.backoffMs)}ms`,
    "stderr",
  );
  s.handlers.onStatus({
    state: "respawning",
    since: Date.now(),
    deaths: s.deaths,
    lastError: s.lastError,
  });
  s.respawnTimer = setTimeout(() => {
    s.respawnTimer = null;
    if (!s.stopping) spawn(s);
  }, s.backoffMs);
  s.backoffMs = Math.min(s.backoffMs * 2, s.backoffBounds.maxMs);
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
  const worker = new Worker(s.workerUrl, {
    // The worker declares its namespace from argv as its first import, before
    // any module that resolves a path from it (worker/declare-namespace.ts).
    argv: namespaceArgv(),
    ...(s.workerEnv ? { env: s.workerEnv } : {}),
  });
  s.worker = worker;
  s.spawnedAt = Date.now();

  worker.onmessage = (event: MessageEvent) => {
    dispatch(s, event.data as WorkerToMainFrame);
  };
  worker.addEventListener("error", (event: ErrorEvent) => {
    s.lastError = event.message;
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

  const init: WorkerInitFrame = { type: "init", ...s.settings };
  worker.postMessage(init);
}

export function startSentinelWorker(opts: SentinelWorkerOptions): void {
  if (state) return;
  const backoffBounds = opts.backoff ?? {
    minMs: RESPAWN_BACKOFF_MIN_MS,
    maxMs: RESPAWN_BACKOFF_MAX_MS,
  };
  const s: HostState = {
    handlers: opts.handlers,
    settings: opts.settings,
    workerUrl: opts.worker?.url ?? resolveWorkerUrl(),
    workerEnv: opts.worker?.env,
    backoffBounds,
    worker: null,
    stopping: false,
    stoppedAck: null,
    respawnTimer: null,
    backoffMs: backoffBounds.minMs,
    rapidFailures: 0,
    deaths: 0,
    lastError: null,
    spawnedAt: 0,
  };
  state = s;
  s.handlers.onStatus({ state: "starting", since: Date.now() });
  spawn(s);
}

/**
 * Push live threshold values. The worker cannot getConfig (no plugin runtime),
 * so main watches config and pushes; a wedged main only stales the thresholds —
 * the worker retains the last pushed values. A respawn inits with the latest.
 */
export function pushSentinelThresholds(
  frame: Omit<WorkerThresholdsFrame, "type">,
): void {
  const s = state;
  if (!s) return;
  s.settings = { ...s.settings, ...frame };
  s.worker?.postMessage({
    type: "config",
    ...frame,
  } satisfies MainToWorkerFrame);
}

export async function stopSentinelWorker(): Promise<void> {
  const s = state;
  if (!s) return;
  state = null;
  s.stopping = true;
  if (s.respawnTimer) {
    clearTimeout(s.respawnTimer);
    s.respawnTimer = null;
  }
  const worker = s.worker;
  if (worker) {
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
  s.handlers.onStatus({ state: "stopped", since: Date.now() });
}
