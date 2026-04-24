import { useState } from "react";
import { useResource } from "@core";
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
import { ExcludedPathToggles, excludedPathStateResource } from "./excluded-path-toggles";

const ADDED_COLOR = "var(--chart-added, #16a34a)";
const REMOVED_COLOR = "var(--chart-removed, #dc2626)";
const NET_COLOR = "var(--chart-net, #2563eb)";

const EXT_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
];
const MAX_EXT = EXT_PALETTE.length;
const OTHER_KEY = "other";
const OTHER_COLOR = "#94a3b8";

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

export function CumulativeLinesChart({ filterKey }: { filterKey?: string }) {
  const { data, error } = useFetchJson<{ points: CumulativePoint[] }>(
    "/api/stats/commits/lines/cumulative",
    filterKey,
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

export function LinesRateChart({ bucket, filterKey }: { bucket: Bucket; filterKey?: string }) {
  const { data, error } = useFetchJson<{ points: RatePoint[] }>(
    `/api/stats/commits/lines/rate?bucket=${bucket}`,
    filterKey,
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
  );
}

// --- Breakdown by extension ---

interface ByExtPoint {
  date?: string;
  bucket?: string;
  byExt: Record<string, { added: number; removed: number }>;
}

function topExtensions(points: ByExtPoint[]): string[] {
  const totals = new Map<string, number>();
  for (const p of points) {
    for (const [ext, s] of Object.entries(p.byExt)) {
      totals.set(ext, (totals.get(ext) ?? 0) + s.added + s.removed);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_EXT)
    .map(([ext]) => ext);
}

function flattenByExt(
  points: ByExtPoint[],
  exts: string[],
  xKey: "date" | "bucket",
): Record<string, number>[] {
  const extSet = new Set(exts);
  return points.map((p) => {
    const row: Record<string, number> = { [xKey]: (p as any)[xKey] };
    let otherNet = 0;
    for (const [ext, s] of Object.entries(p.byExt)) {
      const net = s.added - s.removed;
      if (extSet.has(ext)) {
        row[ext] = (row[ext] ?? 0) + net;
      } else {
        otherNet += net;
      }
    }
    if (otherNet !== 0) row[OTHER_KEY] = (row[OTHER_KEY] ?? 0) + otherNet;
    return row;
  });
}

function extColor(ext: string, exts: string[]): string {
  if (ext === OTHER_KEY) return OTHER_COLOR;
  const idx = exts.indexOf(ext);
  return EXT_PALETTE[idx % EXT_PALETTE.length] ?? OTHER_COLOR;
}

export function CumulativeLinesBreakdownChart({ filterKey }: { filterKey?: string }) {
  const { data, error } = useFetchJson<{ points: ByExtPoint[] }>(
    "/api/stats/commits/lines/cumulative?breakdown=ext",
    filterKey,
  );
  const points = data?.points ?? [];
  const exts = topExtensions(points);
  const flatPoints = flattenByExt(points, exts, "date");
  const allKeys = exts.includes(OTHER_KEY)
    ? exts
    : [...new Set([...exts, ...(flatPoints.some((p) => OTHER_KEY in p) ? [OTHER_KEY] : [])])];

  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={flatPoints}
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
                tooltipNumberFormatter(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {allKeys.map((ext) => (
              <Area
                key={ext}
                type="monotone"
                dataKey={ext}
                name={ext}
                stackId="ext"
                stroke={extColor(ext, exts)}
                fill={extColor(ext, exts)}
                fillOpacity={0.7}
                strokeWidth={1}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}

export function LinesRateBreakdownChart({ bucket, filterKey }: { bucket: Bucket; filterKey?: string }) {
  const { data, error } = useFetchJson<{ points: ByExtPoint[] }>(
    `/api/stats/commits/lines/rate?bucket=${bucket}&breakdown=ext`,
    filterKey,
  );
  const points = data?.points ?? [];
  const exts = topExtensions(points);
  const flatPoints = flattenByExt(points, exts, "bucket");
  const hasOther = flatPoints.some((p) => OTHER_KEY in p);
  const allKeys = hasOther ? [...exts, OTHER_KEY] : exts;

  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={flatPoints}
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
                tooltipNumberFormatter(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {allKeys.map((ext) => (
              <Bar
                key={ext}
                dataKey={ext}
                name={ext}
                stackId="ext"
                fill={extColor(ext, exts)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}

export function LinesChartsSection() {
  const [byType, setByType] = useState(false);
  const [bucket, setBucket] = useState<Bucket>("day");
  const { data: overrides } = useResource(excludedPathStateResource);
  const filterKey = JSON.stringify(overrides ?? {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <ExcludedPathToggles dense />
        <button
          type="button"
          onClick={() => setByType((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors shrink-0",
            byType
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          By type
        </button>
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Over time</h3>
        {byType ? <CumulativeLinesBreakdownChart filterKey={filterKey} /> : <CumulativeLinesChart filterKey={filterKey} />}
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Per period</h3>
        {byType ? <LinesRateBreakdownChart bucket={bucket} filterKey={filterKey} /> : <LinesRateChart bucket={bucket} filterKey={filterKey} />}
        <div className="flex flex-wrap gap-1.5 mt-3">
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
    </div>
  );
}
