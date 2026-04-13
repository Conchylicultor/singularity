import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartState,
  ThemedGrid,
  ThemedTooltip,
  ThemedXAxis,
  ThemedYAxis,
  useFetchJson,
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

export function CommitsRateChart() {
  const [bucket, setBucket] = useState<Bucket>("day");
  const { data, error } = useFetchJson<{ points: Point[] }>(
    `/api/stats/commits/rate?bucket=${bucket}`,
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
              <ThemedGrid />
              <ThemedXAxis dataKey="bucket" />
              <ThemedYAxis />
              <ThemedTooltip cursorFill />
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
