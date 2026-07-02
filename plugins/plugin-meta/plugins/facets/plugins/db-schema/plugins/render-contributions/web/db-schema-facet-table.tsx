import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/plugin-meta/plugins/contributions-table/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type {
  DbSchemaFacetData,
  DbSchemaTableRow,
} from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";
import { MdTableChart } from "react-icons/md";

const columns: ColumnDef<DbSchemaTableRow>[] = [
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
    value: (row) => row.pluginId,
    cell: (row) => <PluginChip pluginId={row.pluginId} />,
  },
];

function rows(entries: FacetTableEntry[]): DbSchemaTableRow[] {
  const result: DbSchemaTableRow[] = [];
  for (const entry of entries) {
    const data = entry.data as DbSchemaFacetData;
    for (const t of data.tables) {
      result.push({ pluginId: entry.node.id, name: t.name, varName: t.varName });
    }
  }
  return result;
}

export const dbSchemaFacetTable = defineFacetTable<DbSchemaTableRow>({
  facetId: "db-schema",
  label: "Tables",
  icon: MdTableChart,
  columns,
  rows,
  rowKey: (r) => `${r.pluginId}:${r.name}`,
});
