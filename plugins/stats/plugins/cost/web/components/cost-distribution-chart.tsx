import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartState,
  axisProps,
  barCursor,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
} from "@plugins/stats/plugins/commits/web";
import { useScope, withScope } from "./use-scope";

interface Bucket {
  label: string;
  count: number;
}

export function CostDistributionChart() {
  const { scope } = useScope();
  const { data, error } = useFetchJson<{ buckets: Bucket[] }>(
    withScope("/api/stats/cost/distribution", scope),
    scope,
  );
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.buckets.every((b) => b.count === 0)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data?.buckets ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
              formatter={(value: number) => [value, "conversations"]}
            />
            <Bar dataKey="count" name="Conversations" fill="#2563eb" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
