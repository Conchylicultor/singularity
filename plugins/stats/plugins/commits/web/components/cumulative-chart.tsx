import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useShowEmptyDays } from "@plugins/stats/web";
import {
  ChartState,
  axisProps,
  fillGaps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  useFetchJson,
  yAxisFormatter,
} from "./chart-primitives";

interface Point {
  date: string;
  count: number;
}

export function CumulativeChart({
  url,
  valueLabel,
  dedup,
}: {
  url: string;
  valueLabel: string;
  dedup?: boolean;
}) {
  const fullUrl = dedup ? `${url}?dedup=1` : url;
  const { showEmptyDays } = useShowEmptyDays();
  const { data, error } = useFetchJson<{ points: Point[] }>(fullUrl, dedup ? "dedup" : undefined);
  const points = useMemo(() => {
    const raw = data?.points ?? [];
    return showEmptyDays ? fillGaps(raw, "date", "day", "carry") : raw;
  }, [data?.points, showEmptyDays]);
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={32} />
            <YAxis
              {...axisProps}
              allowDecimals={false}
              width={48}
              tickFormatter={yAxisFormatter}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={lineCursor}
              formatter={(value: number) => [
                tooltipNumberFormatter(value),
                valueLabel,
              ]}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}

export function CumulativeCommitsChart({ dedup }: { dedup?: boolean }) {
  return <CumulativeChart url="/api/stats/commits/cumulative" valueLabel="Commits" dedup={dedup} />;
}
