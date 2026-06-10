import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartState,
  axisProps,
  barCursor,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@plugins/stats/plugins/commits/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCostDistribution } from "../../shared/endpoints";
import { useScope } from "./use-scope";

export function CostDistributionChart() {
  const { scope } = useScope();
  const { data: resp, error } = useEndpoint(getCostDistribution, {}, { query: { scope } });
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && resp.buckets.every((b) => b.count === 0)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={resp?.buckets ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
