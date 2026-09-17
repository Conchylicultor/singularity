import type {
  AnalyticsRange,
  Dimension,
  Granularity,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";

const countFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const exactFormatter = new Intl.NumberFormat();

/** A count: exact below 10k, compact above. */
export function formatCount(n: number): string {
  return n >= 10_000 ? countFormatter.format(n) : exactFormatter.format(n);
}

export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  return `${pct > 0 && pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** An optional rate: a missing denominator reads as a dash, never as zero. */
export function orDash<T>(value: T | null, format: (v: T) => string): string {
  return value === null ? "—" : format(value);
}

export const RANGE_OPTIONS: readonly { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "12m", label: "12 months" },
];

/** "previous 7 days" — the dashed line's legend. */
export function previousPeriodLabel(range: AnalyticsRange): string {
  return range === "today"
    ? "Yesterday"
    : `Previous ${RANGE_OPTIONS.find((r) => r.id === range)!.label}`;
}

/** An x-axis tick for one series bucket (all buckets are UTC). */
export function formatBucket(bucket: string, granularity: Granularity): string {
  switch (granularity) {
    case "hour":
      return `${bucket.slice(11, 13)}:00`;
    case "day":
      return new Date(`${bucket}T00:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    case "month":
      return new Date(`${bucket}T00:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
  }
}

/** How a filter chip names its dimension: "Channel is Search". */
export const DIMENSION_LABEL: Record<Dimension, string> = {
  page: "Page",
  entry_page: "Entry page",
  exit_page: "Exit page",
  channel: "Channel",
  referrer_host: "Referrer",
  referrer_path: "Linking page",
  utm_campaign: "Campaign",
  country: "Country",
  language: "Language",
  device: "Device",
  browser: "Browser",
  os: "OS",
  event: "Event",
};
