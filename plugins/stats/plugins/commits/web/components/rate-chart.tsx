import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { useShowEmptyDays } from "@plugins/stats/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCommitsRate } from "../../shared/endpoints";
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
} from "./chart-primitives";

type Bucket = "hour" | "day" | "week" | "month" | "year";
const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "hour", label: "Hour" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

interface Point {
  bucket: string;
  count: number;
}

export function CommitsRateChart({ dedup }: { dedup?: boolean }) {
  const valueLabel = "Commits";
  const [bucket, setBucket] = useState<Bucket>("day");
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getCommitsRate, {}, { query: { bucket, dedup: dedup ? "true" : "false" } });
  // Plain (non-breakdown) call site — the response is always the plain branch.
  const rawPoints = useMemo(() => (resp?.points ?? []) as Point[], [resp]);
  const points = useMemo(() => {
    return showEmptyDays ? fillGaps(rawPoints, "bucket", bucket) : rawPoints;
  }, [rawPoints, showEmptyDays, bucket]);

  return (
    <div className="flex flex-col gap-3">
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
                formatter={(value: number) => [
                  tooltipNumberFormatter(value),
                  valueLabel,
                ]}
              />
              <Bar
                dataKey="count"
                fill="var(--primary)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartState>
      </div>
      <SegmentedControl options={BUCKETS} value={bucket} onChange={setBucket} />
    </div>
  );
}
