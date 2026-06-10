import { useMemo, useState } from "react";
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
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCostTokenMix } from "../../shared/endpoints";
import { useShowEmptyDays } from "@plugins/stats/web";
import { formatTokens } from "./format";
import { useScope } from "./use-scope";

const SERIES = [
  { key: "cacheRead" as const, name: "Cache read", color: "#94a3b8" },
  { key: "cacheCreation" as const, name: "Cache creation", color: "#0ea5e9" },
  { key: "input" as const, name: "Input", color: "#2563eb" },
  { key: "output" as const, name: "Output", color: "#16a34a" },
];

export function TokenMixChart() {
  const { scope } = useScope();
  const { showEmptyDays } = useShowEmptyDays();
  const { data: resp, error } = useEndpoint(getCostTokenMix, {}, { query: { scope } });
  const points = useMemo(() => {
    const raw = resp?.points ?? [];
    return showEmptyDays ? fillGaps(raw, "date", "day") : raw;
  }, [resp?.points, showEmptyDays]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const handleLegendClick = (payload: any) => {
    const key = payload?.dataKey;
    if (typeof key !== "string") return;
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const legendFormatter = (value: string, entry: any) => {
    const key = typeof entry?.dataKey === "string" ? entry.dataKey : undefined;
    const isHidden = key ? (hidden[key] ?? false) : false;
    return (
      <span style={{ opacity: isHidden ? 0.4 : 1, cursor: "pointer", userSelect: "none" }}>
        {value}
      </span>
    );
  };

  return (
    <div className="h-72 w-full">
      <ChartState
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && resp.points.length === 0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
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
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              onClick={handleLegendClick}
              formatter={legendFormatter}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId="tokens"
                fill={s.color}
                isAnimationActive={false}
                hide={hidden[s.key] ?? false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}
