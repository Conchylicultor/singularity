// The ONE bucket scheme every latency histogram in the ledger uses — the browser's
// accumulator, the server's, the stored rows and the query all share it, which is
// what makes "merge" mean "add the arrays element-wise".
//
// Log-scale, growth 1.2: a bucket's upper edge is 1.2× its lower one, so a
// percentile read off it is within ~±9% of the true value at any magnitude, from a
// 2 ms delivery to a two-minute page load. 66 regular buckets reach ~140 s; one
// more catches everything above.
//
// NEVER change these two numbers in place: every stored row is an array aligned to
// them. A new scheme gets a new HISTOGRAM_SCHEME, and the query ignores rows of any
// other scheme rather than adding misaligned arrays.
export const HISTOGRAM_SCHEME = 1;
const GROWTH = 1.2;
const REGULAR_BUCKETS = 66;

/** Length of every counts array: bucket 0 (< 1 ms), 65 log buckets, 1 overflow. */
export const BUCKET_COUNT = REGULAR_BUCKETS + 1;
const OVERFLOW = BUCKET_COUNT - 1;
const LOG_GROWTH = Math.log(GROWTH);

/** Lower edge of bucket `i`, in ms. Bucket 0 starts at 0; bucket i ≥ 1 at 1.2^(i-1). */
export function bucketLowerMs(i: number): number {
  return i <= 0 ? 0 : GROWTH ** (i - 1);
}

/** The bucket a duration falls in. Negative and NaN durations clamp to bucket 0. */
export function bucketIndexFor(ms: number): number {
  if (!(ms >= 1)) return 0;
  return Math.min(OVERFLOW, 1 + Math.floor(Math.log(ms) / LOG_GROWTH));
}

export function emptyCounts(): number[] {
  return new Array<number>(BUCKET_COUNT).fill(0);
}

/** Element-wise sum. Throws on a misaligned array — that is a scheme mix-up. */
export function mergeCounts(
  a: readonly number[],
  b: readonly number[],
): number[] {
  if (a.length !== BUCKET_COUNT || b.length !== BUCKET_COUNT) {
    throw new Error(
      `latency histogram: cannot merge arrays of length ${a.length} and ${b.length} (scheme ${HISTOGRAM_SCHEME} has ${BUCKET_COUNT} buckets)`,
    );
  }
  return a.map((n, i) => n + (b[i] ?? 0));
}

/**
 * The `p`-th percentile (0 < p ≤ 1) of a histogram, in ms — or null when it holds
 * no sample. Interpolated inside the bucket it lands in: linearly in log space for
 * the log buckets (the scheme's own geometry), linearly for bucket 0. A percentile
 * landing in the overflow bucket answers `maxMs`, the only honest number there.
 */
export function percentileFromCounts(
  counts: readonly number[],
  p: number,
  maxMs: number,
): number | null {
  let total = 0;
  for (const n of counts) total += n;
  if (total === 0) return null;
  const rank = p * total;
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    const n = counts[i] ?? 0;
    if (n === 0) continue;
    if (seen + n >= rank) {
      if (i === OVERFLOW) return maxMs;
      const within = (rank - seen) / n;
      if (i === 0) return within; // 0..1 ms
      const lo = bucketLowerMs(i);
      const value = lo * GROWTH ** within;
      // A bucket's interpolated value can exceed the largest sample actually seen.
      return Math.min(value, maxMs > 0 ? maxMs : value);
    }
    seen += n;
  }
  return maxMs;
}

/** How many samples are at or above the bucket containing `ms`. */
export function countAtOrAbove(counts: readonly number[], ms: number): number {
  let n = 0;
  for (let i = bucketIndexFor(ms); i < counts.length; i++) n += counts[i] ?? 0;
  return n;
}

/** One metric's samples over some span: the mergeable unit the ledger stores. */
export interface HistogramAcc {
  counts: number[];
  count: number;
  sumMs: number;
  maxMs: number;
  /** Samples whose true duration is only known to be AT LEAST what was recorded. */
  censored: number;
  /** Samples seen but kept out of `counts` (hidden tab): they measure throttling. */
  excluded: number;
}

export function emptyAcc(): HistogramAcc {
  return {
    counts: emptyCounts(),
    count: 0,
    sumMs: 0,
    maxMs: 0,
    censored: 0,
    excluded: 0,
  };
}

export function addSample(
  acc: HistogramAcc,
  ms: number,
  flags?: { censored?: boolean; excluded?: boolean },
): void {
  if (flags?.excluded) {
    acc.excluded += 1;
    return;
  }
  const clamped = ms > 0 ? ms : 0;
  const i = bucketIndexFor(clamped);
  acc.counts[i] = (acc.counts[i] ?? 0) + 1;
  acc.count += 1;
  acc.sumMs += clamped;
  if (clamped > acc.maxMs) acc.maxMs = clamped;
  if (flags?.censored) acc.censored += 1;
}

export function mergeAcc(a: HistogramAcc, b: HistogramAcc): HistogramAcc {
  return {
    counts: mergeCounts(a.counts, b.counts),
    count: a.count + b.count,
    sumMs: a.sumMs + b.sumMs,
    maxMs: Math.max(a.maxMs, b.maxMs),
    censored: a.censored + b.censored,
    excluded: a.excluded + b.excluded,
  };
}

export function isEmptyAcc(acc: HistogramAcc): boolean {
  return acc.count === 0 && acc.excluded === 0;
}
