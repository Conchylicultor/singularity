import type { TimelineHealthPoint } from "../../../shared/frames";
import { hostPressureScore } from "../../../shared/pressure";
import { downsampleBucketMax, DEFAULT_MAX_HEALTH_POINTS } from "../downsample";

// Structural views of the health JSONL lines — the pure mapping stays
// testable without importing the health-monitor schemas (the scan module owns
// parsing).

export interface BackendSampleLike {
  sampledAt: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  physFootprintMb: number;
  wallJumpMs?: number;
}

export interface HostSampleLike {
  sampledAt: number;
  loadAvg1: number;
  swapInPagesPerSec: number;
  swapOutPagesPerSec: number;
  // Optional: pre-cutover JSONL lines lack the compressor fields; such points
  // simply score on load alone.
  compressionsPerSec?: number;
  decompressionsPerSec?: number;
  compressorMb?: number;
  wallJumpMs?: number;
}

// A wall-jump (sleep-wake) point is the classifier for the dark gap before it
// (heat.ts labels that gap "sleep") but is calm by construction, so bucket-max
// would drop it inside any shared bucket — force-keep it. Rare: one per
// suspend, so the point cap only overshoots by the number of sleeps.
function keepWallJumpPoints<T extends { sampledAt: number; wallJumpMs?: number }>(
  kept: T[],
  all: readonly T[],
): T[] {
  const have = new Set(kept.map((s) => s.sampledAt));
  const extra = all.filter((s) => s.wallJumpMs !== undefined && !have.has(s.sampledAt));
  if (extra.length === 0) return kept;
  return [...kept, ...extra].sort((a, b) => a.sampledAt - b.sampledAt);
}

// Backend lane: window-filter then bucket-max on the event-loop p99 — the
// congestion signal the heat strip renders — so a p99 spike survives
// downsampling.
export function backendHealthPoints(
  samples: readonly BackendSampleLike[],
  fromMs: number,
  toMs: number,
  maxPoints: number = DEFAULT_MAX_HEALTH_POINTS,
): TimelineHealthPoint[] {
  const inWindow = samples.filter((s) => s.sampledAt >= fromMs && s.sampledAt <= toMs);
  const kept = downsampleBucketMax(inWindow, {
    fromMs,
    toMs,
    maxPoints,
    atMsOf: (s) => s.sampledAt,
    valueOf: (s) => s.eventLoopP99Ms,
  });
  return keepWallJumpPoints(kept, inWindow).map((s) => ({
    atMs: s.sampledAt,
    p99Ms: s.eventLoopP99Ms,
    maxMs: s.eventLoopMaxMs,
    physMb: s.physFootprintMb,
    wallJumpMs: s.wallJumpMs,
  }));
}

// Host lane: same shape, bucket-max on the shared pressure score (max of the
// load and decompression ramps — shared/pressure.ts, the same ranking the web
// heat strip colors by) so a compressor spike inside a calm-load bucket
// survives downsampling. `swap` folds swap-in + out pages/sec into the one
// number the strip shows.
export function hostHealthPoints(
  samples: readonly HostSampleLike[],
  fromMs: number,
  toMs: number,
  maxPoints: number = DEFAULT_MAX_HEALTH_POINTS,
  cpuCount = 8,
): TimelineHealthPoint[] {
  const inWindow = samples.filter((s) => s.sampledAt >= fromMs && s.sampledAt <= toMs);
  const kept = downsampleBucketMax(inWindow, {
    fromMs,
    toMs,
    maxPoints,
    atMsOf: (s) => s.sampledAt,
    valueOf: (s) =>
      hostPressureScore({ loadAvg1: s.loadAvg1, decompPerSec: s.decompressionsPerSec }, cpuCount),
  });
  return keepWallJumpPoints(kept, inWindow).map((s) => ({
    atMs: s.sampledAt,
    loadAvg1: s.loadAvg1,
    swap: s.swapInPagesPerSec + s.swapOutPagesPerSec,
    decompPerSec: s.decompressionsPerSec,
    compPerSec: s.compressionsPerSec,
    compressorMb: s.compressorMb,
    wallJumpMs: s.wallJumpMs,
  }));
}
