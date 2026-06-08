import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { DbSchemaFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { tableDetailPane } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { MdTableChart } from "react-icons/md";

type TableRow = {
  plugin: PluginNode;
  name: string;
  varName: string;
};

const columns: ColumnDef<TableRow>[] = [
  {
    id: "name",
    header: "SQL Name",
    width: "minmax(0,1fr)",
    value: (row) => row.name,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.name}</code>
    ),
  },
  {
    id: "varName",
    header: "TS Var",
    value: (row) => row.varName,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.varName}</span>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
];

function rows(entries: FacetTableEntry[]): TableRow[] {
  const result: TableRow[] = [];
  for (const entry of entries) {
    const data = entry.data as DbSchemaFacetData;
    for (const t of data.tables) {
      result.push({ plugin: entry.node, name: t.name, varName: t.varName });
    }
  }
  return result;
}

export const dbSchemaFacetTable = defineFacetTable<TableRow>({
  facetId: "db-schema",
  label: "Tables",
  icon: MdTableChart,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.hierarchyId}:${r.name}`,
  // Clicking a table opens its live-SQL detail pane (columns, FKs, indexes,
  // row count, sample rows) owned by `catalog/plugins/tables`.
  onRowClick: (r, { openPane }) =>
    openPane(
      tableDetailPane,
      { tableName: r.name, pluginId: r.plugin.hierarchyId },
      { mode: "push" },
    ),
});
