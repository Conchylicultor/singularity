import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/plugin-meta/plugins/contributions-table/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import {
  contributionId,
  type ContributionsFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import { MdLayers } from "react-icons/md";

type ContributionRow = {
  /**
   * This row's identity, minted in `rows()` rather than derived from what the
   * row displays. `(plugin, slot, id)` is not unique: eight plugins register two
   * panes from one barrel, and any two contributions to one slot whose id does
   * not resolve spell exactly the same triple — colliding React keys, a
   * virtualizer keying two rows the same, and a selection that always lands on
   * the first of the pair.
   */
  key: string;
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
    // A contribution's position in its own plugin's `static` array is unique by
    // construction and stable across renders — the array is the barrel's
    // declaration order, and every plugin appears as exactly one entry.
    data.static.forEach((c, i) => {
      result.push({
        key: `${entry.node.id}#${i}:${c.slot}`,
        plugin: entry.node,
        slot: c.slot,
        id: contributionId(c),
      });
    });
  }
  return result;
}

export const contributionsFacetTable = defineFacetTable<ContributionRow>({
  facetId: "contributions",
  label: "Contributions",
  icon: MdLayers,
  columns,
  rows,
  rowKey: (r) => r.key,
});
