import {
  DIMENSIONS,
  ZERO_METRICS,
  type AnalyticsReport,
  type Metrics,
  type ReportRow,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";

export function metrics(partial: Partial<Metrics>): Metrics {
  return { ...ZERO_METRICS, ...partial };
}

export function row(value: string, partial: Partial<Metrics>): ReportRow {
  return { value, ...metrics(partial) };
}

export function report(
  overrides: Partial<AnalyticsReport> = {},
): AnalyticsReport {
  const rows = Object.fromEntries(
    DIMENSIONS.map((d) => [d, []]),
  ) as unknown as AnalyticsReport["rows"];
  return {
    source: "raw",
    range: "30d",
    granularity: "day",
    filters: [],
    generatedAt: "2026-06-15T11:00:00.000Z",
    current: {
      from: "2026-05-17",
      to: "2026-06-15",
      summary: metrics({
        visitors: 100,
        visits: 120,
        pageviews: 300,
        bounces: 60,
        durationMs: 120_000 * 120,
      }),
      series: [],
    },
    previous: null,
    ...overrides,
    rows: {
      ...rows,
      channel: [
        row("Search", { visitors: 60, visits: 70 }),
        row("Direct", { visitors: 40, visits: 50 }),
      ],
      page: [
        row("/", { visitors: 90, pageviews: 200 }),
        row("/story", { visitors: 20, pageviews: 30 }),
      ],
      ...overrides.rows,
    },
  };
}
