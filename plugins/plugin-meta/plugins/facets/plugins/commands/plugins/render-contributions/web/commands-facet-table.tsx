import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/studio/plugins/contributions/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { CommandDef } from "@plugins/plugin-meta/plugins/facets/plugins/commands/core";
import { MdKeyboardCommandKey } from "react-icons/md";

type CommandRow = {
  plugin: PluginNode;
  name: string;
  commandId: string;
};

const columns: ColumnDef<CommandRow>[] = [
  {
    id: "name",
    header: "Command",
    width: "minmax(0,1fr)",
    value: (row) => row.name,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.name}</code>
    ),
  },
  {
    id: "commandId",
    header: "Command ID",
    value: (row) => row.commandId,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.commandId}</span>
    ),
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
];

function rows(entries: FacetTableEntry[]): CommandRow[] {
  const result: CommandRow[] = [];
  for (const entry of entries) {
    const data = entry.data as CommandDef[];
    for (const c of data) {
      result.push({
        plugin: entry.node,
        name: `${c.groupName}.${c.memberName}`,
        commandId: c.commandId,
      });
    }
  }
  return result;
}

export const commandsFacetTable = defineFacetTable<CommandRow>({
  facetId: "commands",
  label: "Commands",
  icon: MdKeyboardCommandKey,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.commandId}`,
});
