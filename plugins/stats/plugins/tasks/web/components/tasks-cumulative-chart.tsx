import { useState } from "react";
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
import {
  ChartState,
  axisProps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  useFetchJson,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web/components/chart-primitives";

const TOTAL_COLOR = "var(--chart-total, #2563eb)";
const ACTIVE_COLOR = "var(--chart-active, #f59e0b)";
const COMPLETED_COLOR = "var(--chart-completed, #16a34a)";

type SeriesKey = "total" | "active" | "completed";

interface Point {
  date: string;
  total: number;
  active: number;
  completed: number;
}

export function TasksCumulativeChart() {
  const { data, error } = useFetchJson<{ points: Point[] }>(
    "/api/stats/tasks/cumulative",
  );
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    total: false,
    active: false,
    completed: false,
  });
  const onLegendClick = (e: any) => {
    const k = e?.dataKey as SeriesKey | undefined;
    if (k === "total" || k === "active" || k === "completed") {
      setHidden((h) => ({ ...h, [k]: !h[k] }));
    }
  };
  const legendFormatter = (value: string, entry: any) => {
    const k = entry?.dataKey as SeriesKey | undefined;
    const isHidden = k ? hidden[k] : false;
    return (
      <span
        style={{
          color: isHidden ? "var(--muted-foreground)" : "var(--foreground)",
          textDecoration: isHidden ? "line-through" : "none",
          cursor: "pointer",
        }}
      >
        {value}
      </span>
    );
  };

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
            <XAxis dataKey="date" {...axisProps} minTickGap={48} />
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
              formatter={(value: number, name: string) => [
                tooltipNumberFormatter(value),
                name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              onClick={onLegendClick}
              formatter={legendFormatter}
            />
            <Line
              type="monotone"
              dataKey="total"
              name="Total"
              stroke={TOTAL_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.total}
            />
            <Line
              type="monotone"
              dataKey="active"
              name="Active"
              stroke={ACTIVE_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.active}
            />
            <Line
              type="monotone"
              dataKey="completed"
              name="Completed"
              stroke={COMPLETED_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.completed}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
