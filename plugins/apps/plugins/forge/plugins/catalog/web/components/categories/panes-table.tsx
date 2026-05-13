import { useMemo } from "react";
import type { PluginNode, ContributionInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataTable,
  type ColumnDef,
} from "@plugins/primitives/plugins/data-table/web";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

type PaneRow = { item: ContributionInfo; plugin: PluginNode };

const columns: ColumnDef<PaneRow>[] = [
  {
    id: "paneId",
    header: "Pane ID",
    width: "w-40 shrink-0",
    value: (row) => row.item.paneId ?? "",
    cell: (row) => (
      <code className="truncate font-mono text-foreground">
        {row.item.paneId ?? "—"}
      </code>
    ),
  },
  {
    id: "segment",
    header: "Segment",
    width: "flex-1 min-w-0",
    value: (row) => row.item.panePath ?? "",
    cell: (row) => (
      <code className="truncate font-mono text-muted-foreground">
        {row.item.panePath ?? "—"}
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

export function PanesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () =>
      flattenTree<ContributionInfo>(plugins, (p) =>
        (p.publicApi?.contributions ?? []).filter(
          (c) => c.slot === "Pane.Register",
        ),
      ),
    [plugins],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filter={filter}
      rowKey={(row) => `${row.plugin.hierarchyId}:${row.item.paneId}`}
      emptyLabel="No panes found"
    />
  );
}
