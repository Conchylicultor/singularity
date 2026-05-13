import { useMemo } from "react";
import type { PluginNode, ResourceInfo } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  DataTable,
  type ColumnDef,
} from "@plugins/primitives/plugins/data-table/web";
import { flattenTree } from "../catalog-view";
import { PluginChip } from "../plugin-chip";

type ResourceRow = { item: ResourceInfo; plugin: PluginNode };

const columns: ColumnDef<ResourceRow>[] = [
  {
    id: "key",
    header: "Key",
    width: "flex-1 min-w-0",
    value: (row) => row.item.key,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">
        {row.item.key}
      </code>
    ),
  },
  {
    id: "mode",
    header: "Mode",
    width: "w-12 shrink-0 text-center",
    value: (row) => row.item.mode,
    cell: (row) => (
      <span className="font-mono text-[10px] text-muted-foreground/60">
        {row.item.mode}
      </span>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
];

export function ResourcesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () =>
      flattenTree<ResourceInfo>(
        plugins,
        (p) => p.publicApi?.resources ?? [],
      ),
    [plugins],
  );

  return (
    <DataTable
      data={rows}
      columns={columns}
      filter={filter}
      rowKey={(row) => `${row.plugin.hierarchyId}:${row.item.key}`}
      emptyLabel="No resources found"
    />
  );
}
