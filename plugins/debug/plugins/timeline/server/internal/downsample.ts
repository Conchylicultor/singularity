// Bucket-max downsampling for the health heat lanes: divide [fromMs, toMs]
// into `maxPoints` equal buckets and keep, per bucket, the point with the
// highest value — so a one-sample spike survives any window width (a mean or
// stride sampler would erase exactly the samples this view exists to show).
//
// Input points must already be filtered to [fromMs, toMs]; order is preserved
// via bucket index (JSONL append order is already chronological).
export const DEFAULT_MAX_HEALTH_POINTS = 500;

export function downsampleBucketMax<T>(
  points: readonly T[],
  opts: {
    fromMs: number;
    toMs: number;
    maxPoints?: number;
    atMsOf: (p: T) => number;
    valueOf: (p: T) => number;
  },
): T[] {
  const { fromMs, toMs, atMsOf, valueOf } = opts;
  const maxPoints = opts.maxPoints ?? DEFAULT_MAX_HEALTH_POINTS;
  if (points.length <= maxPoints) return [...points];
  const span = toMs - fromMs;
  const best = new Map<number, T>();
  for (const p of points) {
    const raw = Math.floor(((atMsOf(p) - fromMs) / span) * maxPoints);
    const idx = Math.min(maxPoints - 1, Math.max(0, raw));
    const cur = best.get(idx);
    if (cur === undefined || valueOf(p) > valueOf(cur)) best.set(idx, p);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}
