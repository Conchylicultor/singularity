import { useMemo, type ReactElement } from "react";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartState,
  axisProps,
  gridProps,
  lineCursor,
  tooltipContentStyle,
  tooltipLabelStyle,
  yAxisFormatter,
} from "@plugins/stats/plugins/commits/web";
import {
  useEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { loadSeverity } from "@plugins/debug/plugins/slow-ops/core";
import { getHealthData } from "../../shared/endpoints";
import type { HealthSeries, HostSample } from "../../shared/schema";

const WINDOW_MS = 2 * 60 * 60 * 1000; // 2h (v1 fixed window)
const POLL_MS = 10_000;
const SAMPLE_BUCKET_MS = 10_000; // align spikes to the 10s sample grid

type ChartRow = Record<string, number>;
interface LineSpec {
  key: string;
  label: string;
  color: string;
}

// One coalesced slow-op spike line: a 10s bucket on the shared time axis, the
// worst severity in the bucket, and the op naming the worst offender (used only
// to label destructive lines).
interface SpikeMarker {
  key: string;
  x: number; // bucket time in epoch ms — same scale as the sampledAt axis
  severity: "muted" | "warning" | "destructive";
  label: string;
}

// Severity → stroke color (presentational, local to the charts).
const SEVERITY_STROKE: Record<SpikeMarker["severity"], string> = {
  muted: "var(--muted-foreground)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

const SEVERITY_RANK: Record<SpikeMarker["severity"], number> = {
  muted: 0,
  warning: 1,
  destructive: 2,
};

const fmtTime = (v: number): string =>
  new Date(v).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function MetricChart({
  data,
  lines,
  markers,
}: {
  data: ChartRow[];
  lines: LineSpec[];
  markers?: SpikeMarker[];
}): ReactElement {
  return (
    <div className="h-44 w-full">
      <ChartState error={null} loading={false} empty={data.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="sampledAt"
              type="number"
              domain={["dataMin", "dataMax"]}
              {...axisProps}
              tickFormatter={fmtTime}
              minTickGap={48}
            />
            <YAxis {...axisProps} width={48} tickFormatter={yAxisFormatter} />
            <Tooltip
              isAnimationActive={false}
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              cursor={lineCursor}
              labelFormatter={(v) => fmtTime(Number(v))}
            />
            {/* Slow-op spike lines, drawn BEFORE the data lines so the metric
                series paint on top. The op name labels only the destructive
                lines, naming the worst offenders without cluttering the rest. */}
            {markers?.map((m) => (
              <ReferenceLine
                key={m.key}
                x={m.x}
                stroke={SEVERITY_STROKE[m.severity]}
                strokeWidth={1}
                strokeOpacity={0.7}
                ifOverflow="hidden"
              >
                {m.severity === "destructive" ? (
                  <Label
                    value={m.label}
                    position="insideTopRight"
                    angle={-90}
                    fontSize={9}
                    fill="var(--muted-foreground)"
                  />
                ) : null}
              </ReferenceLine>
            ))}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.label}
                stroke={l.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartState>
    </div>
  );
}

function ChartBlock({
  label,
  data,
  lines,
  markers,
}: {
  label: string;
  data: ChartRow[];
  lines: LineSpec[];
  markers?: SpikeMarker[];
}): ReactElement {
  return (
    <Stack gap="xs">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <MetricChart data={data} lines={lines} markers={markers} />
    </Stack>
  );
}

function BackendSection({ series }: { series: HealthSeries }): ReactElement {
  const rows = useMemo(
    () =>
      [...series.samples].sort((a, b) => a.sampledAt - b.sampledAt) as unknown as ChartRow[],
    [series.samples],
  );
  // Coalesce the (potentially hundreds of) markers to the 10s sample grid: one
  // line per non-empty bucket at the bucket time, colored by the worst severity
  // in the bucket and labeled by that bucket's most-severe op. A dense storm
  // reads as a thick colored band without rendering hundreds of DOM nodes.
  const markers = useMemo<SpikeMarker[]>(() => {
    const buckets = new Map<number, SpikeMarker>();
    for (const m of series.slowOpMarkers) {
      const x = Math.round(m.atTime.getTime() / SAMPLE_BUCKET_MS) * SAMPLE_BUCKET_MS;
      const severity = loadSeverity(m.loadAvg1, m.cpuCount);
      const existing = buckets.get(x);
      if (!existing || SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) {
        buckets.set(x, {
          key: String(x),
          x,
          severity,
          label: `${m.operationKind} ${m.operation}`,
        });
      }
    }
    return [...buckets.values()];
  }, [series.slowOpMarkers]);
  const latest = series.samples.length
    ? series.samples.reduce((a, b) => (a.sampledAt > b.sampledAt ? a : b))
    : null;
  return (
    <Stack as="section" gap="sm">
      <Stack direction="row" align="center" gap="sm">
        <SectionLabel>{series.worktree}</SectionLabel>
        {latest ? (
          <Text variant="caption" tone="muted">
            {`${latest.rssMb.toFixed(0)} MB RSS · p99 ${latest.eventLoopP99Ms.toFixed(0)} ms`}
          </Text>
        ) : null}
      </Stack>
      <Grid cols={2} minCellWidth="20rem" gap="xl">
        <ChartBlock
          label="Event-loop lag (ms)"
          data={rows}
          markers={markers}
          lines={[
            { key: "eventLoopP99Ms", label: "p99", color: "var(--primary)" },
            { key: "eventLoopMaxMs", label: "max", color: "var(--destructive)" },
          ]}
        />
        <ChartBlock
          label="Memory (MB)"
          data={rows}
          markers={markers}
          lines={[
            { key: "rssMb", label: "RSS", color: "var(--destructive)" },
            { key: "heapUsedMb", label: "heap used", color: "var(--primary)" },
          ]}
        />
      </Grid>
      <ChartBlock
        label="Heap growth per interval (MB)"
        data={rows}
        markers={markers}
        lines={[{ key: "heapGrowthMb", label: "Δ heap", color: "var(--warning)" }]}
      />
    </Stack>
  );
}

function HostSection({ samples }: { samples: HostSample[] }): ReactElement | null {
  const rows = useMemo(
    () => [...samples].sort((a, b) => a.sampledAt - b.sampledAt) as unknown as ChartRow[],
    [samples],
  );
  if (rows.length === 0) return null;
  return (
    <Stack as="section" gap="sm">
      <SectionLabel>Host</SectionLabel>
      <Grid cols={2} minCellWidth="20rem" gap="xl">
        <ChartBlock
          label="Load average"
          data={rows}
          lines={[
            { key: "loadAvg1", label: "1m", color: "var(--primary)" },
            { key: "loadAvg5", label: "5m", color: "var(--warning)" },
          ]}
        />
        <ChartBlock
          label="Free memory (MB) · swap-out (pages/s)"
          data={rows}
          lines={[
            { key: "freeMemMb", label: "free MB", color: "var(--success)" },
            { key: "swapOutPagesPerSec", label: "swap-out/s", color: "var(--destructive)" },
          ]}
        />
      </Grid>
    </Stack>
  );
}

export function HealthMonitorPanel(): ReactElement {
  const { data, error } = useEndpoint(
    getHealthData,
    {},
    { query: { windowMs: WINDOW_MS }, refetchInterval: POLL_MS },
  );

  if (error) {
    return (
      <Inset pad="lg">
        <Placeholder tone="error">{getEndpointErrorMessage(error)}</Placeholder>
      </Inset>
    );
  }
  if (!data) {
    return (
      <Inset pad="lg">
        <Placeholder>Loading…</Placeholder>
      </Inset>
    );
  }

  return (
    <Inset pad="lg">
      <Stack gap="xl">
        <HostSection samples={data.hostSamples} />
        {data.series.length === 0 ? (
          <Placeholder>No health samples yet — the sampler warms up within ~10s.</Placeholder>
        ) : (
          data.series.map((s) => <BackendSection key={s.worktree} series={s} />)
        )}
      </Stack>
    </Inset>
  );
}
