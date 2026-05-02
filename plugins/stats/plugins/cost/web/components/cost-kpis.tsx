import { ChartState, useFetchJson } from "@plugins/stats/plugins/commits/web";
import { ScopeToggle } from "./scope-toggle";
import { useScope, withScope } from "./use-scope";
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
  const { data, error } = useFetchJson<Totals>(
    withScope("/api/stats/cost/totals", scope),
    scope,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Sourced from <code>ccusage</code>: parses{" "}
          <code>~/.claude/projects</code> on each load.
        </p>
        <ScopeToggle />
      </div>
      <ChartState
        error={error}
        loading={data === null}
        empty={!!data && data.sessionCount === 0}
      >
        {data && <KpiGrid totals={data} />}
      </ChartState>
    </div>
  );
}

function KpiGrid({ totals }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
    <div className="rounded border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          muted
            ? "mt-1 text-base font-medium text-foreground"
            : "mt-1 text-2xl font-semibold text-foreground"
        }
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
