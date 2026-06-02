import type { ReactElement } from "react";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import {
  getRuntimeProfile,
  resetRuntimeProfile,
} from "../../shared/endpoints";

interface AggRow {
  label: string;
  count: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
}

// Shared column definitions for all three tables.
const AGG_COLUMNS: ColumnDef<AggRow>[] = [
  {
    id: "label",
    header: "Label",
    width: "flex-1 min-w-0",
    cell: (row) => (
      <span className="truncate font-mono text-xs" title={row.label}>
        {row.label}
      </span>
    ),
  },
  {
    id: "count",
    header: "Count",
    width: "w-14 text-right",
    value: (row) => row.count,
  },
  {
    id: "avgMs",
    header: "Avg (ms)",
    width: "w-20 text-right",
    value: (row) => row.avgMs,
  },
  {
    id: "maxMs",
    header: "Max (ms)",
    width: "w-20 text-right",
    value: (row) => row.maxMs,
  },
  {
    id: "lastMs",
    header: "Last (ms)",
    width: "w-20 text-right",
    value: (row) => row.lastMs,
  },
];

function toAggRows(
  aggregates: {
    label: string;
    count: number;
    totalMs: number;
    maxMs: number;
    lastMs: number;
  }[],
): AggRow[] {
  return aggregates
    .map((agg) => ({
      label: agg.label,
      count: agg.count,
      avgMs: Math.round(agg.totalMs / agg.count),
      maxMs: agg.maxMs,
      lastMs: agg.lastMs,
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
          <span className="text-sm font-medium">Runtime</span>
        </div>
        <Placeholder>No spans recorded yet — interact with the app to generate data.</Placeholder>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex items-center justify-between px-3">
        <span className="text-sm font-medium">Runtime</span>
        <button
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate({})}
        >
          Reset window
        </button>
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
      <div className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <DataTable
        data={rows}
        columns={AGG_COLUMNS}
        rowKey={(row) => row.label}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}
