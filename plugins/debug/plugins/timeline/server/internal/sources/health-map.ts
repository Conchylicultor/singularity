import type { TimelineHealthPoint } from "../../../shared/frames";
import { downsampleBucketMax, DEFAULT_MAX_HEALTH_POINTS } from "../downsample";

// Structural views of the health JSONL lines — the pure mapping stays
// testable without importing the health-monitor schemas (the scan module owns
// parsing).

export interface BackendSampleLike {
  sampledAt: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  physFootprintMb: number;
}

export interface HostSampleLike {
  sampledAt: number;
  loadAvg1: number;
  swapInPagesPerSec: number;
  swapOutPagesPerSec: number;
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
  return kept.map((s) => ({
    atMs: s.sampledAt,
    p99Ms: s.eventLoopP99Ms,
    maxMs: s.eventLoopMaxMs,
    physMb: s.physFootprintMb,
  }));
}

// Host lane: same shape, bucket-max on loadAvg1; `swap` folds swap-in + out
// pages/sec into the one pressure number the strip shows.
export function hostHealthPoints(
  samples: readonly HostSampleLike[],
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
    valueOf: (s) => s.loadAvg1,
  });
  return kept.map((s) => ({
    atMs: s.sampledAt,
    loadAvg1: s.loadAvg1,
    swap: s.swapInPagesPerSec + s.swapOutPagesPerSec,
  }));
}
