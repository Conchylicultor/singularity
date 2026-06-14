import { useMemo, useState, type ReactElement } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  DataTable,
  type ColumnDef,
  type SortState,
} from "@plugins/primitives/plugins/data-table/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  slowOpsResource,
  type SlowOp,
  type CallerBreakdown,
} from "@plugins/slow-ops/core";

// Default ranking: aggregate impact (total time across all occurrences). A
// structural bottleneck — one query draining many routes — surfaces at the top.
const DEFAULT_SORT: SortState = { columnId: "totalMs", direction: "desc" };

const COLUMNS: ColumnDef<SlowOp>[] = [
  {
    id: "operation",
    header: "Operation",
    width: "minmax(0,1fr)",
    value: (row) => `${row.operationKind} ${row.operation}`,
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-2xs">
        <div className="flex min-w-0 items-center gap-xs">
          <Badge variant="muted" size="md" className="font-mono">
            {row.operationKind}
          </Badge>
          <Text as="span" variant="caption" className="truncate font-mono" title={row.operation}>
            {row.operation}
          </Text>
        </div>
        {row.callers.length > 0 && <CallerBreakdownLines callers={row.callers} />}
      </div>
    ),
  },
  {
    id: "count",
    header: "Count",
    width: "4rem",
    align: "end",
    value: (row) => row.count,
  },
  {
    id: "totalMs",
    header: "Total (ms)",
    width: "5.5rem",
    align: "end",
    value: (row) => Math.round(row.totalMs),
  },
  {
    id: "maxMs",
    header: "Max (ms)",
    width: "5rem",
    align: "end",
    value: (row) => Math.round(row.maxMs),
  },
  {
    id: "lastMs",
    header: "Last (ms)",
    width: "5rem",
    align: "end",
    value: (row) => Math.round(row.lastMs),
  },
  {
    id: "lastSeen",
    header: "Last seen",
    width: "7rem",
    align: "end",
    value: (row) => row.lastSeenAt.getTime(),
    cell: (row) => (
      <Text as="span" variant="caption" className="text-muted-foreground">
        <RelativeTime date={row.lastSeenAt} />
      </Text>
    ),
  },
];

function CallerBreakdownLines({ callers }: { callers: CallerBreakdown[] }): ReactElement {
  const sorted = [...callers].sort((a, b) => b.totalMs - a.totalMs);
  return (
    <div className="flex flex-col gap-2xs pl-md">
      {sorted.map((c) => (
        <span
          key={`${c.kind}:${c.label}`}
          className="truncate font-mono text-3xs text-muted-foreground"
          title={`${c.kind}:${c.label}`}
        >
          ↳ {c.kind}:{c.label} ×{c.count} ({Math.round(c.totalMs)} ms)
        </span>
      ))}
    </div>
  );
}

export function SlowOpsView() {
  const result = useResource(slowOpsResource);
  return (
    <ResourceView resource={result} fallback={<Loading />}>
      {(ops) => <SlowOpsViewInner ops={ops} />}
    </ResourceView>
  );
}

function SlowOpsViewInner({ ops }: { ops: SlowOp[] }) {
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);

  const toggleSort = (columnId: string) => {
    setSortState((prev) =>
      prev.columnId === columnId
        ? { columnId, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { columnId, direction: "desc" },
    );
  };

  // Pre-sort so the default view is ranked by aggregate impact even before the
  // table's own sort kicks in; the controlled sortState then keeps it in sync.
  const data = useMemo(() => [...ops].sort((a, b) => b.totalMs - a.totalMs), [ops]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <DataTable
        data={data}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        sortState={sortState}
        onToggleSort={toggleSort}
        emptyLabel="No slow operations recorded"
      />
    </div>
  );
}
