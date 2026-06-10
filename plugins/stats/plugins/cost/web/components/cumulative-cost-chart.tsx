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
import {
  ChartState,
  axisProps,
  fillGaps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
} from "@plugins/stats/plugins/commits/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCostCumulative } from "../../shared/endpoints";
import { useShowEmptyDays } from "@plugins/stats/web";
import { formatUsd, formatUsdCompact } from "./format";
import { useScope } from "./use-scope";

export function CumulativeCostChart() {
  const { scope } = useScope();
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getCostCumulative, {}, { query: { scope } });
  const points = useMemo(() => {
    const raw = resp?.points ?? [];
    return showEmptyDays ? fillGaps(raw, "date", "day", "carry") : raw;
  }, [resp?.points, showEmptyDays]);
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && resp.points.length === 0}
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
