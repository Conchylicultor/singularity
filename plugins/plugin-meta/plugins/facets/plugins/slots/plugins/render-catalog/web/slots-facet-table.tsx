import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { SlotDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import { MdExtension } from "react-icons/md";

type SlotRow = {
  plugin: PluginNode;
  groupName: string;
  memberName: string;
  slotId: string;
};

const columns: ColumnDef<SlotRow>[] = [
  {
    id: "name",
    header: "Group.Member",
    width: "12rem",
    value: (row) => `${row.groupName}.${row.memberName}`,
    cell: (row) => (
      <code className="truncate font-mono font-medium text-foreground">
        {row.groupName}.{row.memberName}
      </code>
    ),
  },
  {
    id: "slotId",
    header: "Slot ID",
    width: "minmax(0,1fr)",
    value: (row) => row.slotId,
    cell: (row) => (
      <code className="truncate font-mono text-muted-foreground/60">
        {row.slotId}
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

function rows(entries: FacetTableEntry[]): SlotRow[] {
  const result: SlotRow[] = [];
  for (const entry of entries) {
    const data = entry.data as SlotDef[];
    for (const s of data) {
      result.push({
        plugin: entry.node,
        groupName: s.groupName,
        memberName: s.memberName,
        slotId: s.slotId,
      });
    }
  }
  return result;
}

export const slotsFacetTable = defineFacetTable<SlotRow>({
  facetId: "slots",
  label: "Slots",
  icon: MdExtension,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.slotId}`,
});
