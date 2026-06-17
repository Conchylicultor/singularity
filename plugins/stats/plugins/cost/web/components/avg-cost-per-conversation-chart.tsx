import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCostAvgPerConversation } from "../../shared/endpoints";
import { formatUsd, formatUsdCompact, formatTokensCompact } from "./format";
import { useScope } from "./use-scope";

interface ByFamilyEntry {
  avgCost: number;
  avgTokens: number;
}

interface Point {
  date: string;
  avgCost: number;
  avgTokens: number;
  sessionCount: number;
  byFamily: Record<string, ByFamilyEntry>;
  rolling7ByFamily: Record<string, { cost: number | null; tokens: number | null }>;
  rolling7Cost: number | null;
  rolling7Tokens: number | null;
}

const FAMILY_PALETTE: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#2563eb",
  haiku: "#16a34a",
};
const FALLBACK_PALETTE = ["#dc2626", "#f59e0b", "#0891b2", "#db2777"];

function colorFor(family: string, idx: number): string {
  return (
    FAMILY_PALETTE[family] ??
    FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length] ??
    "#64748b"
  );
}

function flattenCost(
  points: Point[],
  families: string[],
): Record<string, number | null>[] {
  return points.map((p) => {
    const row: Record<string, number | null> = {
      date: p.date as unknown as number,
      rolling7Cost: p.rolling7Cost,
    };
    for (const fam of families) {
      row[fam] = p.byFamily[fam]?.avgCost ?? 0;
      row[`r7_${fam}`] = p.rolling7ByFamily[fam]?.cost ?? null;
    }
    return row;
  });
}

function flattenTokens(
  points: Point[],
  families: string[],
): Record<string, number | null>[] {
  return points.map((p) => {
    const row: Record<string, number | null> = {
      date: p.date as unknown as number,
      rolling7Tokens: p.rolling7Tokens,
    };
    for (const fam of families) {
      row[fam] = p.byFamily[fam]?.avgTokens ?? 0;
      row[`r7_${fam}`] = p.rolling7ByFamily[fam]?.tokens ?? null;
    }
    return row;
  });
}

export function AvgCostPerConversationChart() {
  const { scope } = useScope();
  const { data: resp, error } = useEndpoint(getCostAvgPerConversation, {}, { query: { scope } });

  const points = resp?.points ?? [];
  const families = resp?.families ?? [];
  const costRows = flattenCost(points, families);
  const tokenRows = flattenTokens(points, families);

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Text as="h3" variant="caption" className="font-medium text-muted-foreground">
          Avg cost / conversation by model
        </Text>
        <div className="h-56 w-full">
          <ChartState
            error={error ? getEndpointErrorMessage(error) : null}
            loading={resp === undefined}
            empty={!!resp && points.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={costRows}
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
                  formatter={(value: number, name: string) => {
                    if (name === "rolling7Cost")
                      return [formatUsd(value), "total 7d avg"];
                    if (name.endsWith(" 7d avg"))
                      return [formatUsd(value), name];
                    return [formatUsd(value), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {families.map((fam, i) => (
                  <Bar
                    key={fam}
                    dataKey={fam}
                    name={fam}
                    stackId="cost"
                    fill={colorFor(fam, i)}
                    isAnimationActive={false}
                  />
                ))}
                {families.map((fam, i) => (
                  <Line
                    key={`r7_${fam}`}
                    type="monotone"
                    dataKey={`r7_${fam}`}
                    name={`${fam} 7d avg`}
                    stroke={colorFor(fam, i)}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                    connectNulls
                    legendType="none"
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="rolling7Cost"
                  name="total 7d avg"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartState>
        </div>
      </Stack>

      <Stack gap="md">
        <Text as="h3" variant="caption" className="font-medium text-muted-foreground">
          Avg tokens / conversation by model
        </Text>
        <div className="h-56 w-full">
          <ChartState
            error={error ? getEndpointErrorMessage(error) : null}
            loading={resp === undefined}
            empty={!!resp && points.length === 0}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={tokenRows}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} minTickGap={32} />
                <YAxis
                  {...axisProps}
                  width={56}
                  tickFormatter={formatTokensCompact}
                />
                <Tooltip
                  isAnimationActive={false}
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  cursor={barCursor}
                  formatter={(value: number, name: string) => {
                    if (name === "rolling7Tokens")
                      return [yAxisFormatter(value), "7-day avg"];
                    return [yAxisFormatter(value), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {families.map((fam, i) => (
                  <Bar
                    key={fam}
                    dataKey={fam}
                    name={fam}
                    stackId="tokens"
                    fill={colorFor(fam, i)}
                    isAnimationActive={false}
                  />
                ))}
                {families.map((fam, i) => (
                  <Line
                    key={`r7_${fam}`}
                    type="monotone"
                    dataKey={`r7_${fam}`}
                    name={`${fam} 7d avg`}
                    stroke={colorFor(fam, i)}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                    connectNulls
                    legendType="none"
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="rolling7Tokens"
                  name="total 7d avg"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartState>
        </div>
      </Stack>
    </Stack>
  );
}
