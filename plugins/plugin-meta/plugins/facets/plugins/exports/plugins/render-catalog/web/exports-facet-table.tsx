import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { ExportsData } from "@plugins/plugin-meta/plugins/facets/plugins/exports/core";
import { MdOutput } from "react-icons/md";

type ExportRow = {
  plugin: PluginNode;
  runtime: string;
  name: string;
  kind: "type" | "value";
  consumers: string[];
};

const columns: ColumnDef<ExportRow>[] = [
  {
    id: "name",
    header: "Symbol",
    width: "minmax(0,1fr)",
    value: (row) => row.name,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.name}</code>
    ),
  },
  {
    id: "runtime",
    header: "Runtime",
    value: (row) => row.runtime,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.runtime}</span>
    ),
  },
  {
    id: "kind",
    header: "Kind",
    value: (row) => row.kind,
    cell: (row) => <Badge size="sm">{row.kind}</Badge>,
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
  {
    id: "consumers",
    header: "Consumers",
    cell: (row) =>
      row.consumers.length > 0 ? (
        <span className="shrink-0 text-3xs text-muted-foreground/60">
          {row.consumers.length} consumer{row.consumers.length !== 1 ? "s" : ""}
        </span>
      ) : null,
  },
];

const RUNTIMES = ["web", "server", "central", "core", "shared"] as const;

function rows(entries: FacetTableEntry[]): ExportRow[] {
  const result: ExportRow[] = [];
  for (const entry of entries) {
    const data = entry.data as ExportsData;
    for (const runtime of RUNTIMES) {
      for (const sym of data[runtime]) {
        result.push({
          plugin: entry.node,
          runtime,
          name: sym.name,
          kind: sym.kind,
          consumers: sym.consumers,
        });
      }
    }
  }
  return result;
}

export const exportsFacetTable = defineFacetTable<ExportRow>({
  facetId: "exports",
  label: "Exports",
  icon: MdOutput,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.runtime}:${r.name}`,
});
