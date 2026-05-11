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
import {
  ChartState,
  axisProps,
  barCursor,
  fillGaps,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
} from "@plugins/stats/plugins/commits/web";
import { useShowEmptyDays } from "@plugins/stats/web";
import { formatUsd, formatUsdCompact } from "./format";
import { useScope, withScope } from "./use-scope";

interface DailyByModelPoint {
  date: string;
  byModel: Record<string, number>;
}

interface Resp {
  points: DailyByModelPoint[];
  models: string[];
}

// Family-based palette; specific revisions (opus-4-7, sonnet-4-6, …)
// inherit the family color so the chart stays readable as versions roll over.
const FAMILY_PALETTE: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#2563eb",
  haiku: "#16a34a",
};

const FALLBACK_PALETTE = [
  "#dc2626",
  "#f59e0b",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

function colorFor(model: string, idx: number): string {
  for (const [fam, color] of Object.entries(FAMILY_PALETTE)) {
    if (model.startsWith(fam)) return color;
  }
  return FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length] ?? "#64748b";
}

export function DailyCostChart() {
  const { scope } = useScope();
  const { showEmptyDays } = useShowEmptyDays();
  const { data, error } = useFetchJson<Resp>(
    withScope("/api/stats/cost/daily", scope),
    scope,
  );
  const models = data?.models ?? [];
  const rows = useMemo(() => {
    const raw = (data?.points ?? []).map((p) => ({ date: p.date, ...p.byModel }));
    return showEmptyDays ? fillGaps(raw, "date", "day") : raw;
  }, [data?.points, showEmptyDays]);

  return (
    <div className="h-72 w-full">
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && rows.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={32} />
            <YAxis
              {...axisProps}
              width={56}
              tickFormatter={formatUsdCompact}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
              formatter={(value: number, name: string) => [
                formatUsd(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {models.map((m, i) => (
              <Bar
                key={m}
                dataKey={m}
                name={m}
                stackId="cost"
                fill={colorFor(m, i)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
