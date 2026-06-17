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
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getPushesWaitTime } from "../../shared/endpoints";
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";

type Bucket = "day" | "week" | "month";

export function WaitTimeChart({ bucket }: { bucket: Bucket }) {
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getPushesWaitTime, {}, { query: { bucket } });
  const rawPoints = useMemo(() => resp?.points ?? [], [resp]);
  const points = useMemo(() => {
    return showEmptyDays ? fillGaps(rawPoints, "bucket", bucket) : rawPoints;
  }, [rawPoints, showEmptyDays, bucket]);

  return (
    <Stack gap="sm">
      <Text as="p" variant="label" className="text-muted-foreground">
        Lock wait time (seconds)
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
    </Stack>
  );
}
