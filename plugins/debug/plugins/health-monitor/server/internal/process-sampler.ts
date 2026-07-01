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
import { worktreeDataDir, currentWorktreeName, isMain } from "@plugins/infra/plugins/paths/server";
import type { HealthSample } from "../../shared/schema";
import {
  startStallProfiler,
  stopStallProfiler,
  drainAndMaybeDump,
} from "./stall-profiler";

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

let histogram: IntervalHistogram | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let channel: LogChannel | null = null;
let gcObserver: PerformanceObserver | null = null;
let gcCount = 0;
let gcTotalMs = 0;
let lastHeapUsedBytes = 0;
// Wall-time of the previous tick. A blocked loop fires its tick LATE, so the real
// drain window (and the JSC sample count's denominator) is now - lastTickAt, not
// the nominal interval. Used only on main where the stall profiler is armed.
let lastTickAt = 0;

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
  const mem = process.memoryUsage();
  const sample: HealthSample = {
    sampledAt: Date.now(),
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
  };
  // Drain the JSC sampler for this window BEFORE resetting the histogram so the
  // drained samples and eventLoopMaxMs describe the same window. On a stall this
  // dumps the dominant blocking stack; otherwise it just bounds memory. Main only
  // (no-op elsewhere — the profiler is never armed off-main). windowMs is the
  // actual elapsed wall-time, which on a stall is ~the block duration.
  if (isMain()) {
    drainAndMaybeDump(sample.eventLoopMaxMs, sample.sampledAt, sample.sampledAt - lastTickAt);
  }
  lastTickAt = sample.sampledAt;
  histogram.reset();
  gcCount = 0;
  gcTotalMs = 0;
  lastHeapUsedBytes = mem.heapUsed;
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
  lastTickAt = Date.now();
  // Arm the on-stall stack-trace flight recorder. Main only: stalls are a
  // main-backend problem (mirrors the host sampler, which is also main-only).
  if (isMain()) startStallProfiler();
  interval = setInterval(tick, SAMPLE_INTERVAL_MS);
}

export function stopProcessSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (isMain()) stopStallProfiler();
  if (gcObserver) {
    gcObserver.disconnect();
    gcObserver = null;
  }
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}
