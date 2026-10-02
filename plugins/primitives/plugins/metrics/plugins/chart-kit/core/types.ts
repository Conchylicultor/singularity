/**
 * The chart kit's input vocabulary. It knows nothing about metrics: a caller
 * hands it buckets (the x positions) and one value per bucket per series.
 */

/** One value per bucket. `null` is "not covered" — drawn as a gap, never as 0. */
export type ChartValue = number | null;

/** One x position of a time chart. */
export interface ChartBucket {
  /** Axis label ("Sep 3"). */
  short: string;
  /** Tooltip / table label ("Sat, Sep 3", "Sep 3 – Sep 9"). */
  label: string;
  /** The bucket is still filling (today, this week): drawn lighter / dashed. */
  partial?: boolean;
}

/** One series: `values[i]` belongs to `buckets[i]`. */
export interface ChartSeries {
  key: string;
  label: string;
  /**
   * A CSS colour. Omitted → the series' categorical slot by its index
   * (`var(--categorical-<i+1>)`). Colour follows the entity: keep a series at
   * the same index when a filter hides its neighbours.
   */
  color?: string;
  values: readonly ChartValue[];
}

/** The previous period, aligned bucket by bucket; drawn as a dashed neutral line. */
export interface ChartCompare {
  label: string;
  values: readonly ChartValue[];
}

/**
 * - `area` / `line` — one line per series (area adds a 10% wash).
 * - `stack` — stacked columns of non-negative values.
 * - `mirror` — exactly two series: the first up, the second down.
 * - `net` — exactly one signed series: up is positive, down negative.
 */
export type TimeChartKind = "area" | "line" | "stack" | "mirror" | "net";

/** The units a value can be formatted in (see `format.ts`). */
export type ChartUnit = "count" | "usd" | "seconds" | "percent" | "lines";
