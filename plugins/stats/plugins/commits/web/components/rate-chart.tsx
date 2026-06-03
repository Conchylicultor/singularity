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
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  useFetchJson,
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

export function RateChart({
  baseUrl,
  valueLabel,
  dedup,
}: {
  baseUrl: string;
  valueLabel: string;
  dedup?: boolean;
}) {
  const [bucket, setBucket] = useState<Bucket>("day");
  const { showEmptyDays } = useShowEmptyDays();
  const dedupParam = dedup ? "&dedup=1" : "";
  const { data, error } = useFetchJson<{ points: Point[] }>(
    `${baseUrl}?bucket=${bucket}${dedupParam}`,
    dedup ? "dedup" : undefined,
  );
  const points = useMemo(() => {
    const raw = data?.points ?? [];
    return showEmptyDays ? fillGaps(raw, "bucket", bucket) : raw;
  }, [data?.points, showEmptyDays, bucket]);

  return (
    <div className="flex flex-col gap-3">
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

export function CommitsRateChart({ dedup }: { dedup?: boolean }) {
  return <RateChart baseUrl="/api/stats/commits/rate" valueLabel="Commits" dedup={dedup} />;
}
