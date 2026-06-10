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
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCommitsCumulative } from "../../shared/endpoints";
import {
  ChartState,
  axisProps,
  fillGaps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  yAxisFormatter,
} from "./chart-primitives";

interface Point {
  date: string;
  count: number;
}

export function CumulativeCommitsChart({ dedup }: { dedup?: boolean }) {
  const valueLabel = "Commits";
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getCommitsCumulative, {}, { query: { dedup: dedup ? "true" : "false" } });
  // Plain (non-breakdown) call site — the response is always the plain branch.
  const rawPoints = useMemo(() => (resp?.points ?? []) as Point[], [resp]);
  const points = useMemo(
    () => (showEmptyDays ? fillGaps(rawPoints, "date", "day", "carry") : rawPoints),
    [rawPoints, showEmptyDays],
  );
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && rawPoints.length === 0}
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
