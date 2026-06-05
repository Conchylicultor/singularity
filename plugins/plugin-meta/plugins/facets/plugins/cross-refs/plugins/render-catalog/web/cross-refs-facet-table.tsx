import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { CrossRefsData } from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";
import { MdCallSplit } from "react-icons/md";

type CrossRefRow = {
  plugin: PluginNode;
  used: string;
  runtime: string;
};

const columns: ColumnDef<CrossRefRow>[] = [
  {
    id: "used",
    header: "Uses",
    width: "flex-1 min-w-0",
    value: (row) => row.used,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.used}</code>
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
    value: (row) => row.plugin.hierarchyId,
    cell: (row) => <PluginChip hierarchyId={row.plugin.hierarchyId} />,
  },
];

const RUNTIMES = ["server", "central", "web", "core", "shared"] as const;

function rows(entries: FacetTableEntry[]): CrossRefRow[] {
  const result: CrossRefRow[] = [];
  for (const entry of entries) {
    const data = entry.data as CrossRefsData;
    for (const runtime of RUNTIMES) {
      for (const used of data.apiUses[runtime]) {
        result.push({ plugin: entry.node, used, runtime });
      }
    }
  }
  return result;
}

export const crossRefsFacetTable = defineFacetTable<CrossRefRow>({
  facetId: "cross-refs",
  label: "Cross-refs",
  icon: MdCallSplit,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.hierarchyId}:${r.runtime}:${r.used}`,
});
