// ---------------------------------------------------------------------------
// Host-lane pressure score — the ONE ranking shared by the server's
// downsample bucket-max (health-map.ts) and the web heat-strip severity
// (heat.ts), so the points that survive downsampling are exactly the points
// the strip would color worst. Pure — co-located bun tests.
// ---------------------------------------------------------------------------

// Load ramp: loadAvg1 / cpuCount ratio, mirroring slow-ops' loadSeverity ramp.
export const LOAD_RATIO_MILD = 0.75;
export const LOAD_RATIO_STRONG = 1.5;
export const LOAD_RATIO_ERROR = 2.5;

// macOS memory-compressor decompressions/sec ramp. Each decompression is a
// synchronous page fault on the faulting thread, and the channel is what swap
// misses: both forensicated freezes (2026-07-11 00:45 and 03:29) ran at
// 240k–442k decompressions/s with swapIn ≈ 0 against a ~0–1k/s healthy
// baseline (research/2026-07-11-global-observability-freeze-blind-spots.md,
// Stage 2). Educated calibratable defaults, same convention as the sentinel
// detector's thresholds — recalibrate by replaying those two windows.
export const DECOMP_MILD_PER_SEC = 20_000;
export const DECOMP_STRONG_PER_SEC = 100_000;
export const DECOMP_ERROR_PER_SEC = 250_000;

export type PressureBucket = "calm" | "mild" | "strong" | "error";

// Piecewise-linear normalization of one channel onto the common scale where
// 1 = its mild threshold, 2 = strong, 3 = error (still increasing beyond, so
// bucket-max keeps ranking above the error line). Monotone in `value`, which
// is what makes "kept by downsampling" and "colored worst" the same order.
function rampScore(value: number, mild: number, strong: number, error: number): number {
  if (value >= error) return 3 + (value - error) / error;
  if (value >= strong) return 2 + (value - strong) / (error - strong);
  if (value >= mild) return 1 + (value - mild) / (strong - mild);
  return value / mild;
}

/**
 * Pressure score for one host sample: the max of the load ramp and the
 * decompressions ramp on the shared 0..3+ scale. Missing fields (pre-cutover
 * JSONL lines lack the compressor rates) simply score on the other channel.
 */
export function hostPressureScore(
  point: { loadAvg1?: number; decompPerSec?: number },
  cpuCount: number,
): number {
  const loadRatio = cpuCount > 0 ? (point.loadAvg1 ?? 0) / cpuCount : 0;
  return Math.max(
    rampScore(loadRatio, LOAD_RATIO_MILD, LOAD_RATIO_STRONG, LOAD_RATIO_ERROR),
    rampScore(
      point.decompPerSec ?? 0,
      DECOMP_MILD_PER_SEC,
      DECOMP_STRONG_PER_SEC,
      DECOMP_ERROR_PER_SEC,
    ),
  );
}

/** Severity bucket for a pressure score (1/2/3 = the mild/strong/error lines). */
export function pressureBucket(score: number): PressureBucket {
  if (score >= 3) return "error";
  if (score >= 2) return "strong";
  if (score >= 1) return "mild";
  return "calm";
}
