import {
  DIMENSIONS,
  MAX_TOTALS_FILTERS,
  RAW_RETENTION_DAYS,
  REPORT_ROWS_PER_DIMENSION,
  TOTAL_DIMENSION,
  ZERO_METRICS,
  addMetrics,
  addMonths,
  planPeriods,
  reportSourceFor,
  type AnalyticsFilter,
  type AnalyticsQuery,
  type AnalyticsQueryResult,
  type AnalyticsReport,
  type Dimension,
  type Metrics,
  type PeriodReport,
  type ReportPeriod,
  type ReportRow,
  type ReportSource,
} from "../../core";
import {
  dailyTotalsRows,
  metricsOf,
  rawDailyRows,
  rawHourlyTotals,
  type KeyedRow,
} from "./aggregate-sql";
import type { AnalyticsDb } from "./collect";

/**
 * Answer one analytics query as of `now`.
 *
 * - `raw` source: per-visit rows for every day, any number of filters.
 * - `totals` source: `analytics_daily` for the days it holds, plus raw rows for
 *   the days not rolled up yet (today, and any night the rollup missed), at
 *   most one filter — a second one is refused, not approximated.
 */
export async function runAnalyticsQuery(
  dbx: AnalyticsDb,
  query: AnalyticsQuery,
  now: Date,
): Promise<AnalyticsQueryResult> {
  const source = reportSourceFor(query, now);
  if (source === "totals" && query.filters.length > MAX_TOTALS_FILTERS) {
    return {
      kind: "refused",
      reason: "stacked-filters-beyond-raw-window",
      maxFilters: MAX_TOTALS_FILTERS,
      rawWindowDays: RAW_RETENTION_DAYS,
    };
  }
  const periods = planPeriods(query.range, now);
  const current = await periodData(dbx, source, periods.current, query.filters);
  const previous = query.compare
    ? await periodData(dbx, source, periods.previous, query.filters)
    : null;
  const report: AnalyticsReport = {
    source,
    range: query.range,
    granularity: periods.current.granularity,
    filters: query.filters,
    generatedAt: now.toISOString(),
    current: current.period,
    previous: previous?.period ?? null,
    rows: current.rows,
  };
  return { kind: "report", report };
}

interface PeriodData {
  period: PeriodReport;
  rows: Record<Dimension, ReportRow[]>;
}

async function periodData(
  dbx: AnalyticsDb,
  source: ReportSource,
  period: ReportPeriod,
  filters: readonly AnalyticsFilter[],
): Promise<PeriodData> {
  const daily = await dailyRows(dbx, source, period, filters);
  const totals = daily.filter((r) => r.dimension === TOTAL_DIMENSION);
  const seriesRows =
    period.granularity === "hour"
      ? await rawHourlyTotals(dbx, { day: period.from, filters })
      : totals;
  return {
    period: {
      from: period.from,
      to: period.to,
      summary: sumMetrics(totals),
      series: denseSeries(period, seriesRows),
    },
    rows: topRows(daily),
  };
}

function dailyRows(
  dbx: AnalyticsDb,
  source: ReportSource,
  period: ReportPeriod,
  filters: readonly AnalyticsFilter[],
): Promise<KeyedRow[]> {
  if (source === "raw") {
    return rawDailyRows(dbx, {
      from: period.from,
      to: period.to,
      filters,
      onlyNotRolledUp: false,
    });
  }
  return totalsSourceRows(dbx, period, filters);
}

async function totalsSourceRows(
  dbx: AnalyticsDb,
  period: ReportPeriod,
  filters: readonly AnalyticsFilter[],
): Promise<KeyedRow[]> {
  const [filter, ...rest] = filters;
  if (rest.length > 0) {
    throw new Error("analytics: totals source reached with stacked filters");
  }
  const [stored, notRolledUp] = await Promise.all([
    dailyTotalsRows(dbx, {
      from: period.from,
      to: period.to,
      level: filter ? { kind: "filter", filter } : { kind: "unfiltered" },
      dimensions: "all",
    }),
    rawDailyRows(dbx, {
      from: period.from,
      to: period.to,
      filters,
      onlyNotRolledUp: true,
    }),
  ]);
  return [...stored, ...notRolledUp];
}

function sumMetrics(rows: readonly Metrics[]): Metrics {
  return rows.reduce<Metrics>(
    (acc, row) => addMetrics(acc, metricsOf(row)),
    ZERO_METRICS,
  );
}

/** Every bucket of the period in order, zeros where nothing happened. */
function denseSeries(
  period: ReportPeriod,
  totals: readonly KeyedRow[],
): PeriodReport["series"] {
  const byBucket = new Map<string, Metrics>();
  for (const row of totals) {
    const bucket =
      period.granularity === "month" ? addMonths(row.key, 0) : row.key;
    byBucket.set(
      bucket,
      addMetrics(byBucket.get(bucket) ?? ZERO_METRICS, metricsOf(row)),
    );
  }
  return period.buckets.map((bucket) => ({
    bucket,
    metrics: byBucket.get(bucket) ?? ZERO_METRICS,
  }));
}

function rankRows(a: ReportRow, b: ReportRow): number {
  return (
    b.visitors - a.visitors ||
    b.pageviews - a.pageviews ||
    b.events - a.events ||
    a.value.localeCompare(b.value)
  );
}

/** Sum the per-day rows by (dimension, value) and keep each dimension's top rows. */
function topRows(daily: readonly KeyedRow[]): Record<Dimension, ReportRow[]> {
  const byDimension = new Map<Dimension, Map<string, Metrics>>(
    DIMENSIONS.map((d) => [d, new Map()]),
  );
  for (const row of daily) {
    if (row.dimension === TOTAL_DIMENSION) continue;
    const values = byDimension.get(row.dimension);
    if (!values)
      throw new Error(`analytics: unknown dimension ${row.dimension}`);
    values.set(
      row.value,
      addMetrics(values.get(row.value) ?? ZERO_METRICS, metricsOf(row)),
    );
  }
  const rows = {} as Record<Dimension, ReportRow[]>;
  for (const dimension of DIMENSIONS) {
    rows[dimension] = [
      ...(byDimension.get(dimension) ?? new Map<string, Metrics>()),
    ]
      .map(([value, metrics]) => ({ value, ...metrics }))
      .sort(rankRows)
      .slice(0, REPORT_ROWS_PER_DIMENSION);
  }
  return rows;
}
