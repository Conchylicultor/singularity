import type { ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsReport } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { formatBucket, previousPeriodLabel } from "../internal/format";
import type { Kpi } from "../internal/kpis";

// Chart chrome in theme tokens only — the pattern `stats/commits` established.
const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 11 },
} as const;
const gridProps = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
  vertical: false,
} as const;
const tooltipContentStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;
const lineCursor = {
  stroke: "var(--muted-foreground)",
  strokeDasharray: "3 3",
} as const;

interface ChartPoint {
  label: string;
  current: number | null;
  previous: number | null;
}

/**
 * The two periods aligned bucket by bucket: point i of the previous period is
 * drawn under point i of the current one. A bucket whose rate has no
 * denominator is a gap, not a zero.
 */
export function chartPoints(report: AnalyticsReport, kpi: Kpi): ChartPoint[] {
  return report.current.series.map((point, i) => {
    const prev = report.previous?.series[i];
    return {
      label: formatBucket(point.bucket, report.granularity),
      current: kpi.value(point.metrics),
      previous: prev ? kpi.value(prev.metrics) : null,
    };
  });
}

export function TrendChart({
  report,
  kpi,
}: {
  report: AnalyticsReport;
  kpi: Kpi;
}): ReactNode {
  const points = chartPoints(report, kpi);
  const hasPrevious = report.previous !== null;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="label"
            {...axisProps}
            minTickGap={24}
            tickLine={false}
          />
          <YAxis
            {...axisProps}
            width={56}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => kpi.format(v)}
          />
          <Tooltip
            isAnimationActive={false}
            contentStyle={tooltipContentStyle}
            cursor={lineCursor}
            formatter={(value: number) => kpi.format(value)}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="plainline"
            wrapperStyle={{ fontSize: 12 }}
          />
          {hasPrevious && (
            <Line
              name={previousPeriodLabel(report.range)}
              dataKey="previous"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            name={kpi.label}
            dataKey="current"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
