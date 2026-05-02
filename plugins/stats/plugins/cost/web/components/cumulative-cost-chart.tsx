import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartState,
  axisProps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
} from "@plugins/stats/plugins/commits/web";
import { formatUsd, formatUsdCompact } from "./format";
import { useScope, withScope } from "./use-scope";

interface Point {
  date: string;
  cost: number;
}

export function CumulativeCostChart() {
  const { scope } = useScope();
  const { data, error } = useFetchJson<{ points: Point[] }>(
    withScope("/api/stats/cost/cumulative", scope),
    scope,
  );
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data?.points ?? []}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={32} />
            <YAxis
              {...axisProps}
              width={56}
              tickFormatter={formatUsdCompact}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={lineCursor}
              formatter={(value: number) => [formatUsd(value), "Cumulative"]}
            />
            <Line
              type="monotone"
              dataKey="cost"
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
