import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartState,
  axisProps,
  barCursor,
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
} from "@plugins/stats/plugins/commits/web";
import { useScope, withScope } from "./use-scope";

const FAMILY_COLORS: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#2563eb",
  haiku: "#16a34a",
};

const FALLBACK_COLORS = ["#dc2626", "#f59e0b", "#0891b2"];

function colorForFamily(family: string, idx: number): string {
  return FAMILY_COLORS[family] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length] ?? "#64748b";
}

interface Resp {
  points: Array<{ date: string; byFamily: Record<string, number> }>;
  families: string[];
}

export function ModelUsageChart() {
  const { scope } = useScope();
  const { data, error } = useFetchJson<Resp>(
    withScope("/api/stats/cost/daily-by-family", scope),
    scope,
  );
  const rows = (data?.points ?? []).map((p) => ({ date: p.date, ...p.byFamily }));
  const families = data?.families ?? [];
  return (
    <div className="h-72 w-full">
      <ChartState error={error} loading={data === null} empty={!!data && rows.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} minTickGap={32} />
            <YAxis {...axisProps} width={40} allowDecimals={false} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
              formatter={(value: number, name: string) => [`${value} sessions`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {families.map((f, i) => (
              <Bar
                key={f}
                dataKey={f}
                name={f}
                stackId="sessions"
                fill={colorForFamily(f, i)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
