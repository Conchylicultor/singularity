import type { ReactElement } from "react";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Button } from "@/components/ui/button";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  getRuntimeProfile,
  resetRuntimeProfile,
} from "../../shared/endpoints";

interface ParentRow {
  kind: "http" | "db" | "loader";
  label: string;
  count: number;
}

interface AggRow {
  label: string;
  count: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
  byParent: ParentRow[];
}

// How many distinct callers to render inline before collapsing into "+N more".
const MAX_PARENTS_SHOWN = 3;

// Shared column definitions for all three tables. The label cell also renders
// the per-caller attribution breakdown (empty for HTTP, which has no parent).
const AGG_COLUMNS: ColumnDef<AggRow>[] = [
  {
    id: "label",
    header: "Label",
    width: "minmax(0,1fr)",
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" variant="caption" className="truncate font-mono" title={row.label}>
          {row.label}
        </Text>
        {row.byParent.length > 0 && <CallerBreakdown parents={row.byParent} />}
      </div>
    ),
  },
  {
    id: "count",
    header: "Count",
    width: "3.5rem",
    align: "end",
    value: (row) => row.count,
  },
  {
    id: "avgMs",
    header: "Avg (ms)",
    width: "5rem",
    align: "end",
    value: (row) => row.avgMs,
  },
  {
    id: "maxMs",
    header: "Max (ms)",
    width: "5rem",
    align: "end",
    value: (row) => row.maxMs,
  },
  {
    id: "lastMs",
    header: "Last (ms)",
    width: "5rem",
    align: "end",
    value: (row) => row.lastMs,
  },
];

function CallerBreakdown({ parents }: { parents: ParentRow[] }): ReactElement {
  const shown = parents.slice(0, MAX_PARENTS_SHOWN);
  const rest = parents.slice(MAX_PARENTS_SHOWN);
  const restTitle = rest
    .map((p) => `${p.kind}:${p.label} ×${p.count}`)
    .join("\n");
  return (
    <div className="flex flex-col gap-0.5 pl-3">
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
    </div>
  );
}

function toAggRows(
  aggregates: {
    label: string;
    count: number;
    totalMs: number;
    maxMs: number;
    lastMs: number;
    byParent: { parent: { kind: "http" | "db" | "loader"; label: string }; count: number }[];
  }[],
): AggRow[] {
  return aggregates
    .map((agg) => ({
      label: agg.label,
      count: agg.count,
      avgMs: Math.round(agg.totalMs / agg.count),
      maxMs: agg.maxMs,
      lastMs: agg.lastMs,
      byParent: agg.byParent.map((pb) => ({
        kind: pb.parent.kind,
        label: pb.parent.label,
        count: pb.count,
      })),
    }))
    .sort((a, b) => b.maxMs - a.maxMs);
}

export function RuntimeSection(): ReactElement | null {
  const { data } = useEndpoint(getRuntimeProfile, {});

  const resetMutation = useEndpointMutation(resetRuntimeProfile, {
    invalidates: [getRuntimeProfile],
  });

  if (!data) return null;

  const httpRows = toAggRows(data.aggregates.http);
  const dbRows = toAggRows(data.aggregates.db);
  const loaderRows = toAggRows(data.aggregates.loader);

  const hasAny =
    httpRows.length > 0 || dbRows.length > 0 || loaderRows.length > 0;

  if (!hasAny) {
    return (
      <div className="flex flex-col gap-3 px-3 py-4">
        <div className="flex items-center justify-between">
          <Text as="span" variant="label">Runtime</Text>
        </div>
        <Placeholder>No spans recorded yet — interact with the app to generate data.</Placeholder>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex items-center justify-between px-3">
        <Text as="span" variant="label">Runtime</Text>
        <Button
          variant="ghost"
          size="xs"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate({})}
        >
          Reset window
        </Button>
      </div>

      <KindTable title="HTTP Routes" rows={httpRows} emptyLabel="No HTTP spans" />
      <KindTable title="DB Queries" rows={dbRows} emptyLabel="No DB spans" />
      <KindTable title="Loaders" rows={loaderRows} emptyLabel="No loader spans" />
    </div>
  );
}

function KindTable({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: AggRow[];
  emptyLabel: string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <Text as="div" variant="caption" className="px-3 font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </Text>
      <DataTable
        data={rows}
        columns={AGG_COLUMNS}
        rowKey={(row) => row.label}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
