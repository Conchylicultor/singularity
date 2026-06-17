import { useMemo, useState, type ReactElement } from "react";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  DataTable,
  type ColumnDef,
  type SortState,
} from "@plugins/primitives/plugins/data-table/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { getSlowOpsCluster } from "../../shared/endpoints";
import {
  buildClusterAggregate,
  buildContentionTimeline,
  failedWorktrees,
  type ClusterAggregate,
  type TimelineEntry,
} from "../internal/aggregate";

// Aggregate table is ranked by cluster-wide impact (total time across every
// worktree) — a storm draining many worktrees on one op surfaces at the top.
const DEFAULT_SORT: SortState = { columnId: "totalMs", direction: "desc" };

const AGGREGATE_COLUMNS: ColumnDef<ClusterAggregate>[] = [
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
        <Text
          as="span"
          variant="caption"
          className="pl-md text-3xs text-muted-foreground"
          title={row.worktrees.join(", ")}
        >
          slow across {row.worktrees.length} worktree{row.worktrees.length === 1 ? "" : "s"}
        </Text>
      </div>
    ),
  },
  {
    id: "worktrees",
    header: "Worktrees",
    width: "5.5rem",
    align: "end",
    value: (row) => row.worktrees.length,
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

// Load relative to cores is the contention signal: ≥1.5× cores = saturated
// (warning), ≥2.5× = severe (destructive). Drives the muted→warning→destructive
// ramp so a simultaneous storm's high-load rows pop without ad-hoc colors.
function loadVariant(loadAvg1: number, cpuCount: number): "muted" | "warning" | "destructive" {
  const ratio = cpuCount > 0 ? loadAvg1 / cpuCount : 0;
  if (ratio >= 2.5) return "destructive";
  if (ratio >= 1.5) return "warning";
  return "muted";
}

const TIMELINE_COLUMNS: ColumnDef<TimelineEntry>[] = [
  {
    id: "atTime",
    header: "When",
    width: "6rem",
    align: "end",
    value: (row) => row.atTime.getTime(),
    cell: (row) => (
      <Text as="span" variant="caption" className="text-muted-foreground">
        <RelativeTime date={row.atTime} />
      </Text>
    ),
  },
  {
    id: "worktree",
    header: "Worktree",
    width: "9rem",
    value: (row) => row.worktree,
    cell: (row) => (
      <Badge variant="muted" size="sm" className="truncate font-mono" title={row.worktree}>
        {row.worktree}
      </Badge>
    ),
  },
  {
    id: "operation",
    header: "Operation",
    width: "minmax(0,1fr)",
    value: (row) => `${row.operationKind} ${row.operation}`,
    cell: (row) => (
      <Text
        as="span"
        variant="caption"
        className="truncate font-mono"
        title={`${row.operationKind} ${row.operation}`}
      >
        <span className="text-muted-foreground">{row.operationKind}</span> {row.operation}
      </Text>
    ),
  },
  {
    id: "durationMs",
    header: "Dur (ms)",
    width: "5rem",
    align: "end",
    value: (row) => Math.round(row.durationMs),
  },
  {
    id: "load",
    header: "load1 / cpu",
    width: "6rem",
    align: "end",
    value: (row) => row.loadAvg1,
    cell: (row) => (
      <Badge variant={loadVariant(row.loadAvg1, row.cpuCount)} size="sm" className="font-mono">
        {Math.round(row.loadAvg1)} / {row.cpuCount}
      </Badge>
    ),
  },
  {
    id: "pgActiveBackends",
    header: "pg active",
    width: "5rem",
    align: "end",
    value: (row) => row.pgActiveBackends,
  },
];

export function ClusterView(): ReactElement {
  const { data, isLoading } = useEndpoint(getSlowOpsCluster, {});
  const refresh = useEndpointMutation(getSlowOpsCluster, {
    invalidates: [getSlowOpsCluster],
  });

  const [aggSort, setAggSort] = useState<SortState>(DEFAULT_SORT);
  const toggleAggSort = (columnId: string) =>
    setAggSort((prev) =>
      prev.columnId === columnId
        ? { columnId, direction: prev.direction === "desc" ? "asc" : "desc" }
        : { columnId, direction: "desc" },
    );

  const aggregates = useMemo(
    () => (data ? buildClusterAggregate(data.worktrees) : []),
    [data],
  );
  const timeline = useMemo(
    () => (data ? buildContentionTimeline(data.worktrees) : []),
    [data],
  );
  const failed = useMemo(
    () => (data ? failedWorktrees(data.worktrees) : []),
    [data],
  );

  const okCount = data ? data.worktrees.length - failed.length : 0;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <Stack gap="xl" className="px-md py-md">
        <div className="flex items-center justify-between gap-md">
          <Stack gap="2xs">
            <SectionLabel>Cross-worktree cluster</SectionLabel>
            {data && (
              <Text as="span" variant="caption" className="text-muted-foreground">
                {okCount} worktree{okCount === 1 ? "" : "s"} merged
                {failed.length > 0 && (
                  <span
                    className="ml-xs text-warning"
                    title={failed.map((f) => `${f.name}: ${f.error}`).join("\n")}
                  >
                    · {failed.length} failed to load
                  </span>
                )}
              </Text>
            )}
          </Stack>
          <Button
            variant="outline"
            size="xs"
            loading={refresh.isPending}
            onClick={() => refresh.mutate({})}
          >
            Refresh
          </Button>
        </div>

        {isLoading && !data ? (
          <Loading />
        ) : (
          <>
            <Stack gap="xs">
              <SectionLabel>Cluster aggregate</SectionLabel>
              <DataTable
                data={aggregates}
                columns={AGGREGATE_COLUMNS}
                rowKey={(row) => row.key}
                sortState={aggSort}
                onToggleSort={toggleAggSort}
                emptyLabel="No slow operations recorded across the cluster"
              />
            </Stack>

            <Stack gap="xs">
              <SectionLabel>Contention timeline</SectionLabel>
              <Text as="span" variant="caption" className="text-muted-foreground">
                Every captured sample across all worktrees, newest first — a
                simultaneous storm appears as a dense time cluster sharing a high
                load / backend count.
              </Text>
              {timeline.length === 0 ? (
                <Placeholder>No contention samples captured yet.</Placeholder>
              ) : (
                <DataTable
                  data={timeline}
                  columns={TIMELINE_COLUMNS}
                  rowKey={(row) => row.key}
                  emptyLabel="No contention samples captured yet"
                />
              )}
            </Stack>
          </>
        )}
      </Stack>
    </div>
  );
}
