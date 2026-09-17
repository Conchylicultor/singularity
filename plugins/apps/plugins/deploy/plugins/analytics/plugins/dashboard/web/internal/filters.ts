import {
  MAX_TOTALS_FILTERS,
  RAW_RETENTION_DAYS,
  type AnalyticsFilter,
  type Dimension,
  type ReportSource,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";

/**
 * What clicking a ranked row does to the filter chips — the one statement of
 * the rules, read by the panels (to render a row as selected or disabled) and
 * by the click itself.
 *
 * - The row's own filter is on → the click removes it.
 * - Another value of the same dimension is on → the click replaces it (two
 *   values of one visit dimension could never both match).
 * - Otherwise the click adds a filter — unless the report reads daily totals,
 *   which hold single filters only, and one is already on.
 */
export type RowClick =
  | { kind: "remove"; next: AnalyticsFilter[] }
  | { kind: "replace"; next: AnalyticsFilter[] }
  | { kind: "add"; next: AnalyticsFilter[] }
  | { kind: "blocked"; reason: string };

/** The one line shown beside the chips when a totals report cannot take another. */
export const STACKED_FILTERS_NOTE = `Stacked filters cover the last ${RAW_RETENTION_DAYS} days only — pick a shorter range to add another.`;

export function isFilterOn(
  filters: readonly AnalyticsFilter[],
  dimension: Dimension,
  value: string,
): boolean {
  return filters.some((f) => f.dimension === dimension && f.value === value);
}

/** How many filters a report from `source` can take. */
export function maxFiltersFor(source: ReportSource): number {
  return source === "totals" ? MAX_TOTALS_FILTERS : Number.POSITIVE_INFINITY;
}

/** True when a report from `source` cannot take another filter on a new dimension. */
export function atFilterLimit(
  filters: readonly AnalyticsFilter[],
  source: ReportSource,
): boolean {
  return filters.length >= maxFiltersFor(source);
}

export function clickRow(
  filters: readonly AnalyticsFilter[],
  source: ReportSource,
  dimension: Dimension,
  value: string,
): RowClick {
  if (isFilterOn(filters, dimension, value)) {
    return {
      kind: "remove",
      next: filters.filter((f) => f.dimension !== dimension),
    };
  }
  if (filters.some((f) => f.dimension === dimension)) {
    return {
      kind: "replace",
      next: filters.map((f) =>
        f.dimension === dimension ? { dimension, value } : f,
      ),
    };
  }
  if (atFilterLimit(filters, source)) {
    return { kind: "blocked", reason: STACKED_FILTERS_NOTE };
  }
  return { kind: "add", next: [...filters, { dimension, value }] };
}

export function removeFilter(
  filters: readonly AnalyticsFilter[],
  dimension: Dimension,
): AnalyticsFilter[] {
  return filters.filter((f) => f.dimension !== dimension);
}
