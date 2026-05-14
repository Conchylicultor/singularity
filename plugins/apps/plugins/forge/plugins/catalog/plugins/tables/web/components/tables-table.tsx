import { useMemo } from "react";
import type {
  PluginNode,
  TableInfo,
} from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  flattenTree,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { tableDetailPane } from "../panes";

type TableRow = { item: TableInfo; plugin: PluginNode };

export function TablesTable({
  plugins,
  filter,
}: {
  plugins: PluginNode[];
  filter: string;
}) {
  const rows = useMemo(
    () => flattenTree<TableInfo>(plugins, (p) => p.publicApi?.tables ?? []),
    [plugins],
  );

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const lower = filter.toLowerCase();
    return rows.filter(
      (row) =>
        row.item.name.toLowerCase().includes(lower) ||
        row.item.varName.toLowerCase().includes(lower) ||
        row.plugin.hierarchyId.toLowerCase().includes(lower),
    );
  }, [rows, filter]);

  if (filtered.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No tables found
      </div>
    );
  }

  return (
    <div className="flex flex-col text-sm">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
        <span className="w-48 shrink-0">SQL Name</span>
        <span className="flex-1 min-w-0">TS Var</span>
        <span className="shrink-0">Plugin</span>
      </div>

      {filtered.map((row) => (
        <TableRow
          key={`${row.plugin.hierarchyId}:${row.item.name}`}
          row={row}
        />
      ))}
    </div>
  );
}

function TableRow({ row }: { row: TableRow }) {
  const openPane = useOpenPane();
  return (
    <button
      className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-accent/50"
      onClick={() =>
        openPane(
          tableDetailPane,
          { tableName: row.item.name, pluginId: row.plugin.hierarchyId },
          { mode: "push" },
        )
      }
    >
      <code className="w-48 shrink-0 truncate font-mono text-foreground">
        {row.item.name}
      </code>
      <span className="flex-1 min-w-0 truncate font-mono text-xs text-muted-foreground">
        {row.item.varName}
      </span>
      <PluginChip hierarchyId={row.plugin.hierarchyId} />
    </button>
  );
}
