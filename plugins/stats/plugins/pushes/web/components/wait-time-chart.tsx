import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useShowEmptyDays } from "@plugins/stats/web";
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";

interface Point {
  bucket: string;
  avg: number;
  max: number;
  contested: number;
  total: number;
}

export function WaitTimeChart({ bucket }: { bucket: string }) {
  const { showEmptyDays } = useShowEmptyDays();
  const { data, error } = useFetchJson<{ points: Point[] }>(
    `/api/stats/pushes/wait-time?bucket=${bucket}`,
  );
  const points = useMemo(() => {
    const raw = data?.points ?? [];
    return showEmptyDays
      ? fillGaps(raw, "bucket", bucket as "day" | "week" | "month")
      : raw;
  }, [data?.points, showEmptyDays, bucket]);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">
        Lock wait time (seconds)
      </p>
      <div className="h-64 w-full">
        <ChartState
          error={error}
          loading={data === null}
          empty={!!data && data.points.length === 0}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="bucket" {...axisProps} minTickGap={32} />
              <YAxis
                {...axisProps}
                allowDecimals
                width={48}
                tickFormatter={yAxisFormatter}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                cursor={barCursor}
                formatter={(value: number, name: string) => [
                  `${value}s`,
                  name === "avg" ? "Avg wait" : "Max wait",
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === "avg" ? "Avg wait" : "Max wait"
                }
              />
              <Bar
                dataKey="avg"
                fill="var(--primary)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="max"
                fill="var(--muted-foreground)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartState>
      </div>
    </div>
  );
}
