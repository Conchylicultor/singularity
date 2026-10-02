/**
 * The "nice" step at or above `x`: 1, 2, 2.5, 5 or 10 times a power of ten.
 * `x` must be a positive finite number — a zero or negative span has no step.
 */
export function niceStep(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) {
    throw new Error(`niceStep: expected a positive finite span, got ${x}`);
  }
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * 10 ** e;
}

/**
 * Round tick values covering `[lo, hi]` in about `count` steps. The first tick
 * is at or below `lo`, the last at or above `hi`. An empty span (`lo === hi`,
 * e.g. every value is 0) widens to `[lo, lo + 1]` so the axis still has a scale.
 */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
    throw new Error(`niceTicks: invalid domain [${lo}, ${hi}]`);
  }
  const top = hi === lo ? lo + 1 : hi;
  const step = niceStep((top - lo) / Math.max(1, count));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(top / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    // Round away float drift (0.1 + 0.2) so ticks format and compare cleanly.
    out.push(Math.round(v * 1e6) / 1e6 || 0);
  }
  return out;
}

/** A linear map from `domain` onto `range`. A zero-width domain maps everything to `range[0]`. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => r0;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}
