import { freemem, loadavg, totalmem } from "node:os";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import type { HostSample } from "../../shared/schema";
import { parseVmStat, type VmStat } from "./vm-stat";
import { detectWallJumpMs } from "./wall-jump";

// Host-level sampler. Runs only on the main backend (the host is a shared
// resource — one sampler suffices). Appends to the singularity worktree's
// health-host.jsonl. Same setInterval rationale as process-sampler.ts.

const SAMPLE_INTERVAL_MS = 10_000;

let interval: ReturnType<typeof setInterval> | null = null;
// Declared once at module eval (not in start): the sampler can be stopped and
// restarted, and `defineLogSink` throws on a duplicate id. PERF sink.
const channel = defineLogSink({
  id: "health-host",
  description:
    "PERF sink: host-level health samples (load average, memory, swap) for the Debug → Health charts.",
});
// Wall-time of the previous tick: the true denominator for the vm_stat rate
// deltas (a late tick divided by the nominal cadence would inflate the rates —
// after a sleep, catastrophically so), and the wall-jump detection baseline.
let lastTickAt = 0;
let prev: {
  swapins: number;
  swapouts: number;
  compressions: number;
  decompressions: number;
} | null = null;

// macOS-only swap/compressor detail. Returns null elsewhere (host is the user's
// Mac); the sample then reports 0 for the swap fields.
async function readVmStat(): Promise<VmStat | null> {
  if (process.platform !== "darwin") return null;
  const proc = Bun.spawn(["vm_stat"], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return parseVmStat(text);
}

async function tick(): Promise<void> {
  const now = Date.now();
  const wallJumpMs = detectWallJumpMs(now, lastTickAt, SAMPLE_INTERVAL_MS);
  // True elapsed window for the rate deltas, not the nominal cadence: a late
  // tick (wedged loop or sleep) otherwise divides a multi-window counter delta
  // by 10 s and fabricates a rate spike.
  const elapsedSec = Math.max((now - lastTickAt) / 1000, 1);
  lastTickAt = now;
  const vm = await readVmStat();
  let swapIn = 0;
  let swapOut = 0;
  let compressionsPerSec = 0;
  let decompressionsPerSec = 0;
  let compressorMb = 0;
  if (vm) {
    const swapins = vm.map["Swapins"] ?? 0;
    const swapouts = vm.map["Swapouts"] ?? 0;
    const compressions = vm.map["Compressions"] ?? 0;
    const decompressions = vm.map["Decompressions"] ?? 0;
    if (prev) {
      swapIn = Math.max(0, (swapins - prev.swapins) / elapsedSec);
      swapOut = Math.max(0, (swapouts - prev.swapouts) / elapsedSec);
      compressionsPerSec = Math.max(0, (compressions - prev.compressions) / elapsedSec);
      decompressionsPerSec = Math.max(0, (decompressions - prev.decompressions) / elapsedSec);
    }
    prev = { swapins, swapouts, compressions, decompressions };
    compressorMb = ((vm.map["Pages occupied by compressor"] ?? 0) * vm.pageSize) / 1_048_576;
  }
  const total = totalmem();
  const free = freemem();
  // This is the persisted host loadavg (10s cadence, health-host channel — the
  // single source for compressor/swap/freeMem, tail-read by the sentinel). The
  // sentinel worker deliberately keeps its OWN fresh loadavg() syscall on its
  // latch-critical thread rather than reading this file — freshness beats dedup
  // there. See worker/sample.ts and both CLAUDE.mds ("Host-metric ownership").
  const la = loadavg();
  const sample: HostSample = {
    sampledAt: now,
    freeMemMb: free / 1_048_576,
    totalMemMb: total / 1_048_576,
    usedMemMb: (total - free) / 1_048_576,
    loadAvg1: la[0] ?? 0,
    loadAvg5: la[1] ?? 0,
    loadAvg15: la[2] ?? 0,
    swapInPagesPerSec: swapIn,
    swapOutPagesPerSec: swapOut,
    compressionsPerSec,
    decompressionsPerSec,
    compressorMb,
    wallJumpMs,
  };
  channel.publish(JSON.stringify(sample));
}

export function startHostSampler(): void {
  if (interval) return;
  lastTickAt = Date.now();
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- observability sampler: host metrics tick; must stay profiler-invisible or it re-feeds the profiler it measures
  interval = setInterval(() => {
    // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- observability sampler: host metrics tick; must stay profiler-invisible or it re-feeds the profiler it measures
    void tick();
  }, SAMPLE_INTERVAL_MS);
}

export function stopHostSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
