import { join } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import {
  monitorEventLoopDelay,
  PerformanceObserver,
  type IntervalHistogram,
} from "node:perf_hooks";
import { Log, type LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { physFootprintBytes } from "@plugins/framework/plugins/server-core/core";
import { heavyReadQueueDepth } from "@plugins/infra/plugins/host-read-pool/server";
import { getSelfMeter } from "@plugins/infra/plugins/runtime-profiler/core";
import { worktreeDataDir, currentWorktreeName, isMain } from "@plugins/infra/plugins/paths/server";
import type { HealthSample } from "../../shared/schema";
import {
  startStallProfiler,
  stopStallProfiler,
  drainAndMaybeDump,
} from "./stall-profiler";
import { detectWallJumpMs } from "./wall-jump";

// Per-backend health sampler. Installed in the server plugin's `onReady` and
// torn down in `onShutdown`. It samples this process's own event-loop lag, GC
// pressure, and memory every SAMPLE_INTERVAL_MS and appends one JSONL line to
// ~/.singularity/worktrees/<wt>/logs/health.jsonl (durable, read from disk by
// the main backend's pane endpoint).
//
// Why a setInterval and NOT a defineJob / graphile cron task: the sampler is
// the diagnostic instrument FOR a wedged backend. Routing it through the job
// queue (which itself runs on the event loop) would mean a blocked event loop
// silently starves its own health sampler. graphile cron is also 5-field
// (1-minute floor), too coarse for a ~10s cadence. Crucially, the event-loop
// delay histogram accumulates natively in C even while JS is blocked, so a
// *late* tick is itself signal and the recorded `max` still reveals the stall.
// Mirrors jobs/server/internal/stuck-lock-sweeper.ts.

const SAMPLE_INTERVAL_MS = 10_000;
const MAX_FILE_BYTES = 5_000_000; // ~2 days at 10s; tail-trimmed past this

// Arm-on-elevated thresholds for NON-main backends (main is always armed): the
// JSC stall profiler arms the first time a tick observes an elevated event
// loop. Arming is ONE-WAY per process (bun:jsc has no stop — see
// stall-profiler.ts), so this trades "the first stall of a previously-healthy
// backend is missed" for "mostly-idle worktree backends never pay the ~230 Hz
// sampler thread". Stalls under sustained congestion recur, so the evidence
// still lands. Code constants like STALL_THRESHOLD_MS, not config.
const STALL_ARM_P99_MS = 200;
const STALL_ARM_MAX_MS = 1_000;

let histogram: IntervalHistogram | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let channel: LogChannel | null = null;
let gcObserver: PerformanceObserver | null = null;
let gcCount = 0;
let gcTotalMs = 0;
let lastHeapUsedBytes = 0;
// Previous tick's reading of the runtime profiler's cumulative monitoring
// self-meter, diffed each tick into the sample's per-tick monitorOps/monitorMs
// deltas (same pattern as lastHeapUsedBytes).
let lastMonitorOps = 0;
let lastMonitorMs = 0;
// Wall-time of the previous tick. A blocked loop fires its tick LATE, so the real
// drain window (and the JSC sample count's denominator) is now - lastTickAt, not
// the nominal interval. Used only while the stall profiler is armed.
let lastTickAt = 0;
// Whether the JSC stall profiler is armed in THIS process: main arms at boot,
// worktree backends arm-on-elevated (one-way — bun:jsc has no stop).
let stallArmed = false;

function healthFilePath(): string {
  return join(worktreeDataDir(currentWorktreeName()), "logs", "health.jsonl");
}

// Keep the JSONL bounded without a job: trim to the newest half once it grows
// past the cap. One sync rewrite per growth cycle; statSync is cheap.
function rotateIfNeeded(): void {
  const file = healthFilePath();
  let size: number;
  try {
    size = statSync(file).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (size <= MAX_FILE_BYTES) return;
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n");
}

function tick(): void {
  if (!histogram) return;
  const now = Date.now();
  // Machine sleep spanned this window: the histogram accumulated the suspend
  // itself (huge max, calm p50 — a fake incident on every consumer). Reset it
  // BEFORE reading so the sample carries an honest empty window, and stamp
  // wallJumpMs so the gap is classifiable downstream. A merely-late tick from
  // a wedged loop stays below the jump factor and keeps its stall evidence.
  const wallJumpMs = detectWallJumpMs(now, lastTickAt, SAMPLE_INTERVAL_MS);
  if (wallJumpMs !== undefined) histogram.reset();
  const mem = process.memoryUsage();
  const meter = getSelfMeter();
  const sample: HealthSample = {
    sampledAt: now,
    worktree: currentWorktreeName(),
    eventLoopP50Ms: histogram.percentile(50) / 1e6,
    eventLoopP99Ms: histogram.percentile(99) / 1e6,
    eventLoopMaxMs: histogram.max / 1e6,
    // Real footprint, not rss (rss over-counts ~6× on macOS). Sync FFI call so a
    // wedged event loop never starves it. Falls back to rss off-darwin.
    physFootprintMb: (physFootprintBytes() ?? mem.rss) / 1_048_576,
    heapUsedMb: mem.heapUsed / 1_048_576,
    heapTotalMb: mem.heapTotal / 1_048_576,
    // Δ JS heap since the last tick: a sharp drop is a GC reclaim, a sustained
    // climb is allocation pressure. The GC-pressure proxy on Bun (no precise
    // 'gc' perf entries there); gcPrecise* stay 0 unless the runtime exposes them.
    heapGrowthMb: (mem.heapUsed - lastHeapUsedBytes) / 1_048_576,
    gcPreciseCount: gcCount,
    gcPreciseTotalMs: gcTotalMs,
    // Host-wide heavy-read gate queue depth at sample time (cross-process flock
    // gauge; cheap synchronous read). Surfaces backend contention in the pane.
    heavyReadDepth: heavyReadQueueDepth(),
    // Monitoring self-cost this tick: the observability subsystem's own work
    // (everything under runWithoutProfiling), invisible to the profiler by
    // design — this delta is the only place it shows up.
    monitorOps: meter.count - lastMonitorOps,
    monitorMs: meter.totalMs - lastMonitorMs,
    wallJumpMs,
  };
  // Drain the JSC sampler for this window BEFORE resetting the histogram so the
  // drained samples and eventLoopMaxMs describe the same window. On a stall this
  // captures a `stall` trace with the dominant blocking stack; otherwise it just
  // bounds memory. The 2nd arg is the actual elapsed wall-time since the previous
  // drain, which on a stall is ~the block duration.
  if (stallArmed) {
    drainAndMaybeDump(sample.eventLoopMaxMs, sample.sampledAt - lastTickAt);
  } else if (
    sample.eventLoopP99Ms > STALL_ARM_P99_MS ||
    sample.eventLoopMaxMs > STALL_ARM_MAX_MS
  ) {
    // Non-main arm-on-elevated: trouble has appeared on this backend — arm the
    // profiler now (one-way) so the NEXT stall carries stack evidence. Logged
    // so the arming moment is auditable against later stall traces.
    startStallProfiler();
    stallArmed = true;
    channel?.publish(
      `stall profiler armed (eventLoopP99Ms=${sample.eventLoopP99Ms.toFixed(1)}, eventLoopMaxMs=${sample.eventLoopMaxMs.toFixed(1)})`,
    );
  }
  lastTickAt = sample.sampledAt;
  histogram.reset();
  gcCount = 0;
  gcTotalMs = 0;
  lastHeapUsedBytes = mem.heapUsed;
  lastMonitorOps = meter.count;
  lastMonitorMs = meter.totalMs;
  rotateIfNeeded();
  channel?.publish(JSON.stringify(sample));
}

export function startProcessSampler(): void {
  if (interval) return;
  channel = Log.channel("health", { persist: true });
  histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  // Precise GC timing only when the runtime exposes 'gc' performance entries.
  // Bun 1.3.x does not (supportedEntryTypes lacks "gc"), so this stays inert
  // there and heap growth (bun:jsc) is the GC-pressure proxy instead.
  if (PerformanceObserver.supportedEntryTypes.includes("gc")) {
    gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        gcCount += 1;
        gcTotalMs += entry.duration;
      }
    });
    gcObserver.observe({ entryTypes: ["gc"] });
  }
  lastHeapUsedBytes = process.memoryUsage().heapUsed;
  const meter = getSelfMeter();
  lastMonitorOps = meter.count;
  lastMonitorMs = meter.totalMs;
  lastTickAt = Date.now();
  // Arm the on-stall stack-trace flight recorder. Main: always, at boot (the
  // UX-critical backend). Worktree backends: arm-on-elevated in tick() — see
  // the STALL_ARM_* constants.
  if (isMain()) {
    startStallProfiler();
    stallArmed = true;
  }
  interval = setInterval(tick, SAMPLE_INTERVAL_MS);
}

export function stopProcessSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (stallArmed) {
    stopStallProfiler();
    stallArmed = false;
  }
  if (gcObserver) {
    gcObserver.disconnect();
    gcObserver = null;
  }
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}
