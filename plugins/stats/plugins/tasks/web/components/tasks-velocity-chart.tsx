import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";
import { useShowEmptyDays } from "@plugins/stats/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getTasksDaily } from "../../shared/endpoints";

const ADDED_COLOR = "var(--chart-active, #f59e0b)";
const COMPLETED_COLOR = "var(--chart-completed, #16a34a)";
const DROPPED_COLOR = "var(--chart-dropped, #dc2626)";
const NET_COLOR = "var(--chart-total, #2563eb)";

type SeriesKey = "added" | "completed" | "dropped" | "net";

interface DailyPoint {
  date: string;
  added: number;
  completed: number;
  dropped: number;
  net: number;
}

export function TasksVelocityChart() {
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getTasksDaily, {});
  const rawPoints = useMemo(() => (resp?.points ?? []) as DailyPoint[], [resp]);
  const points = useMemo(
    () => (showEmptyDays ? fillGaps(rawPoints, "date", "day") : rawPoints),
    [rawPoints, showEmptyDays],
  );
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    added: false,
    completed: false,
    dropped: false,
    net: false,
  });
  const onLegendClick = (e: any) => {
    const k = e?.dataKey as SeriesKey | undefined;
    if (k === "added" || k === "completed" || k === "dropped" || k === "net") {
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
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && rawPoints.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
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
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
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
            <Bar
              dataKey="added"
              name="Added"
              fill={ADDED_COLOR}
              opacity={0.8}
              isAnimationActive={false}
              hide={hidden.added}
            />
            <Bar
              dataKey="completed"
              name="Completed"
              stackId="resolved"
              fill={COMPLETED_COLOR}
              opacity={0.8}
              isAnimationActive={false}
              hide={hidden.completed}
            />
            <Bar
              dataKey="dropped"
              name="Dropped/held"
              stackId="resolved"
              fill={DROPPED_COLOR}
              opacity={0.8}
              isAnimationActive={false}
              hide={hidden.dropped}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Net (resolved − added)"
              stroke={NET_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.net}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
