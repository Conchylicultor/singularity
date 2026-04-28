import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartState,
  axisProps,
  barCursor,
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
  const dedupParam = dedup ? "&dedup=1" : "";
  const { data, error } = useFetchJson<{ points: Point[] }>(
    `${baseUrl}?bucket=${bucket}${dedupParam}`,
    dedup ? "dedup" : undefined,
  );

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
              data={data?.points ?? []}
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
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              bucket === b.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CommitsRateChart({ dedup }: { dedup?: boolean }) {
  return <RateChart baseUrl="/api/stats/commits/rate" valueLabel="Commits" dedup={dedup} />;
}
