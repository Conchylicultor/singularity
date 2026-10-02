import type {
  ChartCompare,
  ChartSeries,
  ChartValue,
  TimeChartKind,
} from "./types";

/**
 * The categorical slots the theme provides (`--categorical-1…10`). Hues are
 * assigned in this fixed order and never cycled: past the cap the tail folds
 * into one "Other" series on the last slot (see {@link foldSeries}).
 */
export const CATEGORICAL_SLOTS = 10;

/** The categorical colour of the series at `index` (0-based). */
export function categoricalColor(index: number): string {
  if (index < 0 || index >= CATEGORICAL_SLOTS) {
    throw new Error(
      `categoricalColor: slot ${index + 1} is past the ${CATEGORICAL_SLOTS} categorical slots — fold the tail with foldSeries()`,
    );
  }
  return `var(--categorical-${index + 1})`;
}

/** A series with its colour resolved. */
export type ColoredSeries = ChartSeries & { color: string };

/** Resolve each series' colour: its own, or its categorical slot by index. */
export function colorSeries(series: readonly ChartSeries[]): ColoredSeries[] {
  return series.map((s, i) => ({
    ...s,
    color: s.color ?? categoricalColor(i),
  }));
}

/** Key of the folded tail series. */
export const OTHER_KEY = "__other";

/**
 * Keep at most `CATEGORICAL_SLOTS` series: the first `CATEGORICAL_SLOTS - 1`
 * as they are, and the rest summed into one "Other" series. A bucket where any
 * folded series is `null` (not covered) is `null` in "Other" — a partial sum
 * would understate it.
 */
export function foldSeries(series: readonly ChartSeries[]): ChartSeries[] {
  if (series.length <= CATEGORICAL_SLOTS) return [...series];
  const keep = series.slice(0, CATEGORICAL_SLOTS - 1);
  const tail = series.slice(CATEGORICAL_SLOTS - 1);
  const n = tail[0]!.values.length;
  const values: ChartValue[] = [];
  for (let i = 0; i < n; i++) {
    let sum: ChartValue = 0;
    for (const s of tail) {
      const v = s.values[i] ?? null;
      if (v === null) {
        sum = null;
        break;
      }
      sum += v;
    }
    values.push(sum);
  }
  return [...keep, { key: OTHER_KEY, label: `Other (${tail.length})`, values }];
}

/**
 * Throw unless every series (and the compare line) has one value per bucket,
 * and the series count fits the kind: `mirror` takes exactly two, `net`
 * exactly one, the others at least one.
 */
export function assertChartShape(
  kind: TimeChartKind,
  n: number,
  series: readonly ChartSeries[],
  compare: ChartCompare | null,
): void {
  if (kind === "mirror" && series.length !== 2) {
    throw new Error(
      `TimeChart: kind "mirror" takes exactly 2 series, got ${series.length}`,
    );
  }
  if (kind === "net" && series.length !== 1) {
    throw new Error(
      `TimeChart: kind "net" takes exactly 1 series, got ${series.length}`,
    );
  }
  if (series.length === 0) {
    throw new Error(`TimeChart: kind "${kind}" needs at least one series`);
  }
  for (const s of series) {
    if (s.values.length !== n) {
      throw new Error(
        `TimeChart: series "${s.key}" has ${s.values.length} values for ${n} buckets`,
      );
    }
  }
  if (compare && compare.values.length !== n) {
    throw new Error(
      `TimeChart: compare "${compare.label}" has ${compare.values.length} values for ${n} buckets`,
    );
  }
}

/** One stacked segment of bucket `i`: series `index` spans `[from, to]`. */
export interface StackSegment {
  key: string;
  index: number;
  from: number;
  to: number;
  /** The topmost drawn segment of its column — the only one rounded. */
  top: boolean;
}

/**
 * Bucket `i`'s stacked segments bottom-up. Only positive values draw a segment
 * (`0` and `null` stack nothing). A negative value throws: a stack of flows
 * has no meaning below zero — draw it as `net` or `line` instead.
 */
export function stackSegments(
  series: readonly ChartSeries[],
  i: number,
): StackSegment[] {
  const out: StackSegment[] = [];
  let acc = 0;
  series.forEach((s, index) => {
    const v = s.values[i] ?? null;
    if (v === null || v === 0) return;
    if (v < 0) {
      throw new Error(
        `TimeChart: stack series "${s.key}" is negative (${v}) at bucket ${i}`,
      );
    }
    out.push({ key: s.key, index, from: acc, to: acc + v, top: false });
    acc += v;
  });
  const last = out[out.length - 1];
  if (last) last.top = true;
  return out;
}

/** Bucket `i`'s stack total; `null` when every series is `null` there. */
export function stackTotal(
  series: readonly ChartSeries[],
  i: number,
): ChartValue {
  let total: ChartValue = null;
  for (const s of series) {
    const v = s.values[i] ?? null;
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

/**
 * The value range a kind plots over `n` buckets, always including 0 (bars grow
 * from it, and a line's scale reads honestly from it):
 * - `stack` — 0 … the tallest column;
 * - `mirror` — −(the deepest second-series value) … the tallest first-series value;
 * - `line` / `area` / `net` — the min and max of every value.
 * The compare line widens the range too. Nulls are ignored; all-null is `[0, 0]`.
 */
export function valueDomain(
  kind: TimeChartKind,
  n: number,
  series: readonly ChartSeries[],
  compare: ChartCompare | null,
): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  const see = (v: ChartValue | undefined) => {
    if (v === null || v === undefined) return;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };
  for (let i = 0; i < n; i++) {
    if (kind === "stack") {
      const segs = stackSegments(series, i);
      see(segs[segs.length - 1]?.to ?? null);
    } else if (kind === "mirror") {
      see(series[0]!.values[i]);
      const down = series[1]!.values[i] ?? null;
      see(down === null ? null : -down);
    } else {
      for (const s of series) see(s.values[i]);
    }
    if (compare) see(compare.values[i]);
  }
  return { lo, hi };
}
