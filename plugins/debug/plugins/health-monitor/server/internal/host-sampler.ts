import { freemem, loadavg, totalmem } from "node:os";
import { Log, type LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import type { HostSample } from "../../shared/schema";

// Host-level sampler. Runs only on the main backend (the host is a shared
// resource — one sampler suffices). Appends to the singularity worktree's
// health-host.jsonl. Same setInterval rationale as process-sampler.ts.

const SAMPLE_INTERVAL_MS = 10_000;
const INTERVAL_SEC = SAMPLE_INTERVAL_MS / 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let channel: LogChannel | null = null;
let prev: { swapins: number; swapouts: number } | null = null;

interface VmStat {
  pageSize: number;
  map: Record<string, number>;
}

function parseVmStat(text: string): VmStat {
  const pageSizeMatch = text.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16384;
  const map: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z][\w .()/-]+?):\s+(\d+)\.?\s*$/);
    if (m) map[m[1]!.trim()] = Number(m[2]);
  }
  return { pageSize, map };
}

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
  const vm = await readVmStat();
  let swapIn = 0;
  let swapOut = 0;
  let compressorMb = 0;
  if (vm) {
    const swapins = vm.map["Swapins"] ?? 0;
    const swapouts = vm.map["Swapouts"] ?? 0;
    if (prev) {
      swapIn = Math.max(0, (swapins - prev.swapins) / INTERVAL_SEC);
      swapOut = Math.max(0, (swapouts - prev.swapouts) / INTERVAL_SEC);
    }
    prev = { swapins, swapouts };
    compressorMb = ((vm.map["Pages occupied by compressor"] ?? 0) * vm.pageSize) / 1_048_576;
  }
  const total = totalmem();
  const free = freemem();
  const la = loadavg();
  const sample: HostSample = {
    sampledAt: Date.now(),
    freeMemMb: free / 1_048_576,
    totalMemMb: total / 1_048_576,
    usedMemMb: (total - free) / 1_048_576,
    loadAvg1: la[0] ?? 0,
    loadAvg5: la[1] ?? 0,
    loadAvg15: la[2] ?? 0,
    swapInPagesPerSec: swapIn,
    swapOutPagesPerSec: swapOut,
    compressorMb,
  };
  channel?.publish(JSON.stringify(sample));
}

export function startHostSampler(): void {
  if (interval) return;
  channel = Log.channel("health-host", { persist: true });
  interval = setInterval(() => {
    void tick();
  }, SAMPLE_INTERVAL_MS);
}

export function stopHostSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
