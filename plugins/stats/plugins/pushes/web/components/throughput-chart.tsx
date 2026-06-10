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
import { Text } from "@plugins/primitives/plugins/text/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getPushesThroughput } from "../../shared/endpoints";
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

type Bucket = "day" | "week" | "month";

export function ThroughputChart({ bucket }: { bucket: Bucket }) {
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getPushesThroughput, {}, { query: { bucket } });
  const rawPoints = useMemo(() => resp?.points ?? [], [resp]);
  const points = useMemo(() => {
    return showEmptyDays ? fillGaps(rawPoints, "bucket", bucket) : rawPoints;
  }, [rawPoints, showEmptyDays, bucket]);

  return (
    <div>
      <Text as="p" variant="label" className="mb-2 text-muted-foreground">
        Push throughput
      </Text>
      <div className="h-64 w-full">
        <ChartState
          error={error ? getEndpointErrorMessage(error) : null}
          loading={resp === undefined}
          empty={!!resp && rawPoints.length === 0}
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
                allowDecimals={false}
                width={48}
                tickFormatter={yAxisFormatter}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                cursor={barCursor}
                formatter={(value: number, name: string) => [
                  tooltipNumberFormatter(value),
                  name === "success" ? "Success" : "Failed",
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === "success" ? "Success" : "Failed"
                }
              />
              <Bar
                dataKey="success"
                stackId="a"
                fill="#10b981"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="failed"
                stackId="a"
                fill="#ef4444"
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
