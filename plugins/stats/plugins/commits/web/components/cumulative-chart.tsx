import { Line, LineChart, ResponsiveContainer } from "recharts";
import {
  ChartState,
  ThemedGrid,
  ThemedTooltip,
  ThemedXAxis,
  ThemedYAxis,
  useFetchJson,
} from "./chart-primitives";

interface Point {
  date: string;
  count: number;
}

export function CumulativeCommitsChart() {
  const { data, error } = useFetchJson<{ points: Point[] }>(
    "/api/stats/commits/cumulative",
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
            <ThemedGrid />
            <ThemedXAxis dataKey="date" />
            <ThemedYAxis />
            <ThemedTooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
