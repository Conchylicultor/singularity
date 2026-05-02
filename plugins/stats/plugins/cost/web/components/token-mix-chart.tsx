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
  gridProps,
  tooltipContentStyle,
  tooltipLabelStyle,
  useFetchJson,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";
import { formatTokens } from "./format";
import { useScope, withScope } from "./use-scope";

interface Point {
  date: string;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

const SERIES = [
  { key: "cacheRead" as const, name: "Cache read", color: "#94a3b8" },
  { key: "cacheCreation" as const, name: "Cache creation", color: "#0ea5e9" },
  { key: "input" as const, name: "Input", color: "#2563eb" },
  { key: "output" as const, name: "Output", color: "#16a34a" },
];

export function TokenMixChart() {
  const { scope } = useScope();
  const { data, error } = useFetchJson<{ points: Point[] }>(
    withScope("/api/stats/cost/token-mix", scope),
    scope,
  );
  return (
    <div className="h-72 w-full">
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
            <XAxis dataKey="date" {...axisProps} minTickGap={32} />
            <YAxis {...axisProps} width={56} tickFormatter={yAxisFormatter} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={barCursor}
              formatter={(value: number, name: string) => [
                formatTokens(value),
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId="tokens"
                fill={s.color}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
