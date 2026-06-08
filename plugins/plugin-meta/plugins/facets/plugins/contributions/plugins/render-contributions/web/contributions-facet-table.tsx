import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/studio/plugins/contributions/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  contributionId,
  type ContributionsFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { MdLayers } from "react-icons/md";

type ContributionRow = {
  plugin: PluginNode;
  slot: string;
  id?: string;
};

const columns: ColumnDef<ContributionRow>[] = [
  {
    id: "slot",
    header: "Slot",
    width: "12rem",
    value: (row) => row.slot,
    cell: (row) => (
      <code className="truncate font-mono font-medium text-foreground">
        {row.slot}
      </code>
    ),
  },
  {
    id: "id",
    header: "ID",
    width: "minmax(0,1fr)",
    value: (row) => row.id ?? "",
    cell: (row) => (
      <code className="truncate font-mono text-muted-foreground/60">
        {row.id ?? "—"}
      </code>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
];

function rows(entries: FacetTableEntry[]): ContributionRow[] {
  const result: ContributionRow[] = [];
  for (const entry of entries) {
    const data = entry.data as ContributionsFacetData;
    for (const c of data.static) {
      result.push({ plugin: entry.node, slot: c.slot, id: contributionId(c) });
    }
  }
  return result;
}

export const contributionsFacetTable = defineFacetTable<ContributionRow>({
  facetId: "contributions",
  label: "Contributions",
  icon: MdLayers,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.slot}:${r.id ?? ""}`,
});
