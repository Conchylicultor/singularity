import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  useFetchJson,
  yAxisFormatter,
} from "./chart-primitives";

const ADDED_COLOR = "var(--chart-added, #16a34a)";
const REMOVED_COLOR = "var(--chart-removed, #dc2626)";

type SeriesKey = "added" | "removed";

function useToggleable() {
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    added: false,
    removed: false,
  });
  const onLegendClick = (e: any) => {
    const k = e?.dataKey as SeriesKey | undefined;
    if (k === "added" || k === "removed") {
      setHidden((h) => ({ ...h, [k]: !h[k] }));
    }
  };
  const legendFormatter = (value: string, entry: any) => {
    const k = entry?.dataKey as SeriesKey | undefined;
    const isHidden = k ? hidden[k] : false;
    return (
      <span
        style={{
          color: isHidden ? "var(--muted-foreground)" : "var(--foreground)",
          textDecoration: isHidden ? "line-through" : "none",
          cursor: "pointer",
        }}
      >
        {value}
      </span>
    );
  };
  return { hidden, onLegendClick, legendFormatter };
}

interface CumulativePoint {
  date: string;
  added: number;
  removed: number;
}

export function CumulativeLinesChart() {
  const { data, error } = useFetchJson<{ points: CumulativePoint[] }>(
    "/api/stats/commits/lines/cumulative",
  );
  const { hidden, onLegendClick, legendFormatter } = useToggleable();
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data?.points ?? []}
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
              formatter={(value: number, name: string) => [
                tooltipNumberFormatter(value),
                name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              onClick={onLegendClick}
              formatter={legendFormatter}
            />
            <Area
              type="monotone"
              dataKey="added"
              name="Added"
              stroke={ADDED_COLOR}
              fill={ADDED_COLOR}
              fillOpacity={0.2}
              strokeWidth={2}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.added}
            />
            <Area
              type="monotone"
              dataKey="removed"
              name="Removed"
              stroke={REMOVED_COLOR}
              fill={REMOVED_COLOR}
              fillOpacity={0.2}
              strokeWidth={2}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.removed}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}

type Bucket = "hour" | "day" | "week" | "month" | "year";
const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "hour", label: "Hour" },
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

interface RatePoint {
  bucket: string;
  added: number;
  removed: number;
}

export function LinesRateChart() {
  const [bucket, setBucket] = useState<Bucket>("day");
  const { data, error } = useFetchJson<{ points: RatePoint[] }>(
    `/api/stats/commits/lines/rate?bucket=${bucket}`,
  );
  const { hidden, onLegendClick, legendFormatter } = useToggleable();

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
              data={(data?.points ?? []).map((p) => ({ ...p, removed: -p.removed }))}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              stackOffset="sign"
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
                  tooltipNumberFormatter(Math.abs(value)),
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                onClick={onLegendClick}
                formatter={legendFormatter}
              />
              <Bar
                dataKey="added"
                name="Added"
                stackId="lines"
                fill={ADDED_COLOR}
                isAnimationActive={false}
                hide={hidden.added}
              />
              <Bar
                dataKey="removed"
                name="Removed"
                stackId="lines"
                fill={REMOVED_COLOR}
                isAnimationActive={false}
                hide={hidden.removed}
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
