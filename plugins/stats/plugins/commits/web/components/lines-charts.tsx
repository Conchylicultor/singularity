import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
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
import { ExcludedPathToggles } from "./excluded-path-toggles";

const ADDED_COLOR = "var(--chart-added, #16a34a)";
const REMOVED_COLOR = "var(--chart-removed, #dc2626)";
const NET_COLOR = "var(--chart-net, #2563eb)";

type SeriesKey = "added" | "removed" | "net";

function useToggleable() {
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    added: false,
    removed: false,
    net: false,
  });
  const onLegendClick = (e: any) => {
    const k = e?.dataKey as SeriesKey | undefined;
    if (k === "added" || k === "removed" || k === "net") {
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
  const points = (data?.points ?? []).map((p) => ({
    date: p.date,
    added: p.added,
    removed: -p.removed,
    net: p.added - p.removed,
  }));
  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={lineCursor}
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
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={NET_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              hide={hidden.net}
            />
          </ComposedChart>
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

export function LinesChartsSection() {
  return (
    <div className="flex flex-col gap-6">
      <ExcludedPathToggles dense />
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Over time</h3>
        <CumulativeLinesChart />
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Per period</h3>
        <LinesRateChart />
      </div>
    </div>
  );
}
