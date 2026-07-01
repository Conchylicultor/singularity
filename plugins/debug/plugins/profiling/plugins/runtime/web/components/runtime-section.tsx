import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type ReactElement } from "react";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { formatDuration } from "@plugins/debug/plugins/profiling/web";
import {
  getRuntimeProfile,
  resetRuntimeProfile,
} from "../../shared/endpoints";

const RUNTIME_VIEW = defineDataView("debug.profiling.runtime");

type RuntimeKind = "http" | "db" | "loader" | "sub" | "push" | "flush" | "job";

interface ParentRow {
  kind: RuntimeKind;
  label: string;
  count: number;
}

interface AggRow {
  label: string;
  count: number;
  avgMs: number;
  /** Pure operation cost: avg minus average wait. Lock-vs-work, readable directly. */
  workMs: number;
  maxMs: number;
  lastMs: number;
  byParent: ParentRow[];
  /** Per-layer wait (gate/lock → summed ms) across this label's records. */
  waits: Record<string, number>;
}

type RuntimeRow = AggRow & { kind: RuntimeKind };

// How many distinct callers to render inline before collapsing into "+N more".
const MAX_PARENTS_SHOWN = 3;

function CallerBreakdown({ parents }: { parents: ParentRow[] }): ReactElement {
  const shown = parents.slice(0, MAX_PARENTS_SHOWN);
  const rest = parents.slice(MAX_PARENTS_SHOWN);
  const restTitle = rest
    .map((p) => `${p.kind}:${p.label} ×${p.count}`)
    .join("\n");
  return (
    <Stack gap="2xs" className="pl-md">
      {shown.map((p) => (
        <span
          key={`${p.kind}:${p.label}`}
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${p.kind}:${p.label}`}
        >
          ↳ {p.kind}:{p.label} ×{p.count}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="font-mono text-3xs text-muted-foreground"
          title={restTitle}
        >
          +{rest.length} more caller{rest.length === 1 ? "" : "s"}
        </span>
      )}
    </Stack>
  );
}

// The per-layer wait split beneath an entry's label: ⏳ loader-acquire 1700ms.
// Makes head-of-line blocking visible inline (which gate, how long).
function WaitBreakdownLines({ waits }: { waits: Record<string, number> }): ReactElement {
  return (
    <Stack gap="2xs" className="pl-md">
      {Object.entries(waits).map(([layer, ms]) => (
        <span
          key={layer}
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${layer}: ${Math.round(ms)}ms wait`}
        >
          ⏳ {layer} {Math.round(ms)}ms
        </span>
      ))}
    </Stack>
  );
}

function toAggRows(
  aggregates: {
    label: string;
    count: number;
    totalMs: number;
    maxMs: number;
    lastMs: number;
    byParent: { parent: { kind: RuntimeKind; label: string }; count: number }[];
    waits?: Record<string, number>;
  }[],
): AggRow[] {
  return aggregates
    .map((agg) => {
      const waits = agg.waits ?? {};
      const totalWait = Object.values(waits).reduce((a, b) => a + b, 0);
      return {
        label: agg.label,
        count: agg.count,
        avgMs: Math.round(agg.totalMs / agg.count),
        workMs: Math.round((agg.totalMs - totalWait) / agg.count),
        maxMs: agg.maxMs,
        lastMs: agg.lastMs,
        byParent: agg.byParent.map((pb) => ({
          kind: pb.parent.kind,
          label: pb.parent.label,
          count: pb.count,
        })),
        waits,
      };
    })
    .sort((a, b) => b.maxMs - a.maxMs);
}

const RUNTIME_FIELDS: FieldDef<RuntimeRow>[] = [
  {
    id: "kind",
    label: "Kind",
    type: "enum",
    value: (r) => r.kind,
    options: [
      { value: "http", label: "HTTP" },
      { value: "db", label: "DB" },
      { value: "loader", label: "Loader" },
      { value: "sub", label: "Sub" },
      { value: "push", label: "Push" },
      { value: "flush", label: "Flush" },
      { value: "job", label: "Job" },
    ],
    width: "5rem",
  },
  {
    id: "label",
    label: "Label",
    type: "text",
    primary: true,
    value: (r) => r.label,
    width: "minmax(0,1fr)",
    // Renders the per-caller attribution breakdown inline (empty for HTTP,
    // which has no parent).
    cell: (row) => (
      // eslint-disable-next-line layout/no-adhoc-layout -- min-w-0 lets this column shrink within its data-table label track so the label + caller-breakdown lines truncate instead of forcing the cell wide
      <Stack gap="2xs" className="min-w-0">
        <Text as="span" variant="caption" className="truncate font-mono" title={row.label}>
          {row.label}
        </Text>
        {row.byParent.length > 0 && <CallerBreakdown parents={row.byParent} />}
        {Object.keys(row.waits).length > 0 && <WaitBreakdownLines waits={row.waits} />}
      </Stack>
    ),
  },
  {
    id: "count",
    label: "Count",
    type: "number",
    value: (r) => r.count,
    align: "end",
    width: "3.5rem",
  },
  {
    id: "avgMs",
    label: "Avg (ms)",
    type: "number",
    value: (r) => r.avgMs,
    align: "end",
    width: "5rem",
  },
  {
    id: "workMs",
    label: "Work (ms)",
    type: "number",
    value: (r) => r.workMs,
    align: "end",
    width: "5rem",
  },
  {
    id: "maxMs",
    label: "Max (ms)",
    type: "number",
    value: (r) => r.maxMs,
    align: "end",
    width: "5rem",
  },
  {
    id: "lastMs",
    label: "Last (ms)",
    type: "number",
    value: (r) => r.lastMs,
    align: "end",
    width: "5rem",
  },
];

export function RuntimeSection(): ReactElement | null {
  const { data } = useEndpoint(getRuntimeProfile, {});

  const resetMutation = useEndpointMutation(resetRuntimeProfile, {
    invalidates: [getRuntimeProfile],
  });

  const rows = useMemo<RuntimeRow[]>(() => {
    if (!data) return [];
    const tag = (kind: RuntimeKind, aggs: AggRow[]): RuntimeRow[] =>
      aggs.map((r) => ({ ...r, kind }));
    return [
      ...tag("http", toAggRows(data.aggregates.http)),
      ...tag("db", toAggRows(data.aggregates.db)),
      ...tag("loader", toAggRows(data.aggregates.loader)),
      ...tag("sub", toAggRows(data.aggregates.sub)),
      ...tag("push", toAggRows(data.aggregates.push)),
      ...tag("flush", toAggRows(data.aggregates.flush)),
      ...tag("job", toAggRows(data.aggregates.job)),
    ];
  }, [data]);

  if (!data) return null;

  const title = `Runtime — peaks since boot · ${formatDuration(data.windowMs)} window`;

  return (
    <DataView<RuntimeRow>
      rows={rows}
      fields={RUNTIME_FIELDS}
      rowKey={(r) => `${r.kind}:${r.label}`}
      storageKey={RUNTIME_VIEW}
      title={title}
      actions={
        <Button
          variant="ghost"
          loading={resetMutation.isPending}
          onClick={() => resetMutation.mutate({})}
        >
          Reset window
        </Button>
      }
      defaultView="table"
      emptyState="No runtime spans recorded"
    />
  );
}
