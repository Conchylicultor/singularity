import { useMemo } from "react";
import type { PluginNode, SlotInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataTable,
  type ColumnDef,
} from "@plugins/primitives/plugins/data-table/web";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

type SlotRow = { item: SlotInfo; plugin: PluginNode };

const columns: ColumnDef<SlotRow>[] = [
  {
    id: "name",
    header: "Group.Member",
    width: "12rem",
    value: (row) => `${row.item.groupName}.${row.item.memberName}`,
    cell: (row) => (
      <code className="truncate font-mono font-medium text-foreground">
        {row.item.groupName}.{row.item.memberName}
      </code>
    ),
  },
  {
    id: "slotId",
    header: "Slot ID",
    width: "minmax(0,1fr)",
    value: (row) => row.item.slotId,
    cell: (row) => (
      <code className="truncate font-mono text-muted-foreground/60">
        {row.item.slotId}
      </code>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
  {
    id: "contributors",
    cell: (row) =>
      row.item.contributors.length > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {row.item.contributors.length} contrib
          {row.item.contributors.length !== 1 ? "s" : ""}
        </span>
      ) : null,
  },
];

export function SlotsTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () => flattenTree<SlotInfo>(plugins, (p) => p.publicApi?.slots ?? []),
    [plugins],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filter={filter}
      rowKey={(row) => `${row.plugin.hierarchyId}:${row.item.slotId}`}
      emptyLabel="No slots found"
    />
  );
}
