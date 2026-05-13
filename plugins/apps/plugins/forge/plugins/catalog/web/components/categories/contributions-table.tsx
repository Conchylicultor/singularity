import { useMemo } from "react";
import type { PluginNode, ContributionInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataTable,
  type ColumnDef,
} from "@plugins/primitives/plugins/data-table/web";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

type ContributionRow = { item: ContributionInfo; plugin: PluginNode };

const columns: ColumnDef<ContributionRow>[] = [
  {
    id: "slot",
    header: "Slot",
    width: "w-48 shrink-0",
    value: (row) => row.item.slot,
    cell: (row) => (
      <code className="truncate font-mono font-medium text-foreground">
        {row.item.slot}
      </code>
    ),
  },
  {
    id: "id",
    header: "ID",
    width: "flex-1 min-w-0",
    value: (row) => row.item.id ?? "",
    cell: (row) => (
      <code className="truncate font-mono text-muted-foreground/60">
        {row.item.id ?? "—"}
      </code>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
];

export function ContributionsTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () =>
      flattenTree<ContributionInfo>(
        plugins,
        (p) => p.publicApi?.contributions ?? [],
      ),
    [plugins],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filter={filter}
      rowKey={(row, i) => `${row.plugin.hierarchyId}:${row.item.slot}:${row.item.id ?? i}`}
      emptyLabel="No contributions found"
    />
  );
}
