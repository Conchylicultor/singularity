import { ChartState } from "@plugins/stats/plugins/commits/web";
import { useEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { getCostTotals } from "../../shared/endpoints";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { ScopeToggle } from "./scope-toggle";
import { useScope } from "./use-scope";
import { formatTokensCompact, formatUsd } from "./format";

interface Totals {
  totalCost: number;
  totalTokens: number;
  byTokenKind: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  last7Cost: number;
  avgDailyCost: number;
  activeDays: number;
  sessionCount: number;
}

export function CostKpis() {
  const { scope } = useScope();
  const { data: resp, error } = useEndpoint(getCostTotals, {}, { query: { scope } });
  return (
    <Stack gap="lg">
      <div className="flex items-center justify-between">
        <Text as="p" variant="caption" className="text-muted-foreground">
          Sourced from <code>ccusage</code>: parses{" "}
          <code>~/.claude/projects</code> on each load.
        </Text>
        <ScopeToggle />
      </div>
      <ChartState
        error={error ? getEndpointErrorMessage(error) : null}
        loading={resp === undefined}
        empty={!!resp && resp.sessionCount === 0}
      >
        {resp && <KpiGrid totals={resp} />}
      </ChartState>
    </Stack>
  );
}

function KpiGrid({ totals }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-2 gap-md sm:grid-cols-4">
      <Kpi label="Total spent" value={formatUsd(totals.totalCost)} />
      <Kpi
        label="Total tokens"
        value={formatTokensCompact(totals.totalTokens)}
        sub={`${totals.sessionCount} sessions`}
      />
      <Kpi
        label="Last 7 days"
        value={formatUsd(totals.last7Cost)}
        sub="rolling"
      />
      <Kpi
        label="Avg / active day"
        value={formatUsd(totals.avgDailyCost)}
        sub={`${totals.activeDays} days`}
      />
      <Kpi
        label="Input tokens"
        value={formatTokensCompact(totals.byTokenKind.input)}
        muted
      />
      <Kpi
        label="Output tokens"
        value={formatTokensCompact(totals.byTokenKind.output)}
        muted
      />
      <Kpi
        label="Cache creation"
        value={formatTokensCompact(totals.byTokenKind.cacheCreation)}
        muted
      />
      <Kpi
        label="Cache read"
        value={formatTokensCompact(totals.byTokenKind.cacheRead)}
        muted
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-md">
      <Text as="div" variant="caption" className="text-muted-foreground">{label}</Text>
      <Text
        as="div"
        variant={muted ? "subheading" : "title"}
        // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off label→value offset inside the KPI card; restructuring into a Stack would also add spacing before the optional sub-label
        className={muted ? "mt-1 font-medium text-foreground" : "mt-1 text-foreground"}
      >
        {value}
      </Text>
      {sub && <Text as="div" variant="caption" className="text-muted-foreground">{sub}</Text>}
    </div>
  );
}
