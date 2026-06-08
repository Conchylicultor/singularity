import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/studio/plugins/contributions/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { ResourceFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";
import { MdStorage } from "react-icons/md";

type ResourceRow = {
  plugin: PluginNode;
  key: string;
  mode: string;
  runtime: "server" | "central";
};

const columns: ColumnDef<ResourceRow>[] = [
  {
    id: "key",
    header: "Key",
    width: "minmax(0,1fr)",
    value: (row) => row.key,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.key}</code>
    ),
  },
  {
    id: "mode",
    header: "Mode",
    value: (row) => row.mode,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.mode}</span>
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
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
];

function rows(entries: FacetTableEntry[]): ResourceRow[] {
  const result: ResourceRow[] = [];
  for (const entry of entries) {
    const data = entry.data as ResourceFacetData;
    for (const r of data.server) {
      result.push({ plugin: entry.node, key: r.key, mode: r.mode, runtime: "server" });
    }
    for (const r of data.central) {
      result.push({ plugin: entry.node, key: r.key, mode: r.mode, runtime: "central" });
    }
  }
  return result;
}

export const resourcesFacetTable = defineFacetTable<ResourceRow>({
  facetId: "resources",
  label: "Resources",
  icon: MdStorage,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.runtime}:${r.key}`,
});
