import { useCallback, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { useShowEmptyDays } from "@plugins/stats/web";
import {
  autoColorKey,
  useCategoryAvatars,
} from "@plugins/conversations/plugins/conversation-category/web";
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipNumberFormatter,
  useFetchJson,
  yAxisFormatter,
} from "./chart-primitives";

// Tailwind -400 shades as hex, matching the avatar swatch colors
const COLOR_KEY_HEX: Record<string, string> = {
  sky:     "#38bdf8",
  emerald: "#34d399",
  amber:   "#fbbf24",
  rose:    "#fb7185",
  violet:  "#a78bfa",
  indigo:  "#818cf8",
  teal:    "#2dd4bf",
  pink:    "#f472b6",
  orange:  "#fb923c",
  slate:   "#94a3b8",
};
const UNKNOWN_KEY = "Unknown";
const UNKNOWN_COLOR = "#94a3b8";

function useCategoryColorFn(): (cat: string) => string {
  const avatars = useCategoryAvatars();
  return useCallback(
    (cat: string): string => {
      if (cat === UNKNOWN_KEY) return UNKNOWN_COLOR;
      const colorKey = avatars[cat]?.color ?? autoColorKey(cat);
      return COLOR_KEY_HEX[colorKey] ?? UNKNOWN_COLOR;
    },
    [avatars],
  );
}

function useToggleable() {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const onLegendClick = (e: any) => {
    const k = (e?.dataKey ?? e?.value) as string | undefined;
    if (k) setHidden((h) => ({ ...h, [k]: !h[k] }));
  };
  const legendFormatter = (value: string, entry: any) => {
    const k = (entry?.dataKey ?? entry?.value) as string | undefined;
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

interface ByCategoryPoint {
  date?: string;
  bucket?: string;
  byCategory: Record<string, number>;
}

interface CategoryResponse {
  points: ByCategoryPoint[];
  categories: string[];
}

function useOrderedKeys(data: CategoryResponse | null): string[] {
  return useMemo(() => {
    if (!data) return [];
    const { points, categories } = data;
    const present = new Set<string>();
    for (const p of points) {
      for (const cat of Object.keys(p.byCategory)) present.add(cat);
    }
    const ordered: string[] = [];
    for (const cat of categories) {
      if (present.has(cat)) ordered.push(cat);
    }
    for (const cat of present) {
      if (!ordered.includes(cat)) ordered.push(cat);
    }
    return ordered;
  }, [data]);
}

function flattenByCategory(
  points: ByCategoryPoint[],
  cats: string[],
  xKey: "date" | "bucket",
): Record<string, number>[] {
  return points.map((p) => {
    const row: Record<string, number> = { [xKey]: (p as any)[xKey] };
    for (const cat of cats) {
      row[cat] = p.byCategory[cat] ?? 0;
    }
    return row;
  });
}

export function CumulativeCommitsCategoryChart({ dedup }: { dedup?: boolean }) {
  const dedupParam = dedup ? "&dedup=1" : "";
  const { showEmptyDays } = useShowEmptyDays();
  const colorFor = useCategoryColorFn();
  const { hidden, onLegendClick, legendFormatter } = useToggleable();
  const { data, error } = useFetchJson<CategoryResponse>(
    `/api/stats/commits/cumulative?breakdown=category${dedupParam}`,
    dedup ? "dedup" : undefined,
  );
  const allKeys = useOrderedKeys(data);
  const rawFlat = flattenByCategory(data?.points ?? [], allKeys, "date");
  const flatPoints = useMemo(
    () => (showEmptyDays && rawFlat.length >= 2 ? fillGaps(rawFlat, "date", "day", "carry") : rawFlat),
    [rawFlat, showEmptyDays],
  );

  return (
    <div className="h-64 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.points.length === 0}
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
              wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
              onClick={onLegendClick}
              formatter={legendFormatter}
            />
            {allKeys.map((cat) => (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                name={cat}
                stackId="cat"
                stroke={colorFor(cat)}
                fill={colorFor(cat)}
                fillOpacity={0.7}
                strokeWidth={1}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
                hide={!!hidden[cat]}
              />
            ))}
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

export function CommitsRateCategoryChart({ dedup }: { dedup?: boolean }) {
  const [bucket, setBucket] = useState<Bucket>("day");
  const dedupParam = dedup ? "&dedup=1" : "";
  const { showEmptyDays } = useShowEmptyDays();
  const colorFor = useCategoryColorFn();
  const { hidden, onLegendClick, legendFormatter } = useToggleable();
  const { data, error } = useFetchJson<CategoryResponse>(
    `/api/stats/commits/rate?bucket=${bucket}&breakdown=category${dedupParam}`,
    dedup ? "dedup" : undefined,
  );
  const allKeys = useOrderedKeys(data);
  const rawFlat = flattenByCategory(data?.points ?? [], allKeys, "bucket");
  const flatPoints = useMemo(
    () => (showEmptyDays && rawFlat.length >= 2 ? fillGaps(rawFlat, "bucket", bucket) : rawFlat),
    [rawFlat, showEmptyDays, bucket],
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
              data={flatPoints}
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
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
                onClick={onLegendClick}
                formatter={legendFormatter}
              />
              {allKeys.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="cat"
                  fill={colorFor(cat)}
                  isAnimationActive={false}
                  hide={!!hidden[cat]}
                />
              ))}
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
