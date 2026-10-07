import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/plugin-meta/plugins/contributions-table/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { ExemptionsData } from "@plugins/plugin-meta/plugins/facets/plugins/exemptions/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const ruleIcon = symbol("rule");

type ExemptionRow = {
  plugin: PluginNode;
  rule: string;
  paths: string;
  kind: string;
};

const columns: ColumnDef<ExemptionRow>[] = [
  {
    id: "rule",
    header: "Rule",
    width: "minmax(0,1fr)",
    value: (row) => row.rule,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.rule}</code>
    ),
  },
  {
    id: "paths",
    header: "Paths",
    value: (row) => row.paths,
    cell: (row) => (
      <span className="truncate font-mono text-muted-foreground">
        {row.paths}
      </span>
    ),
  },
  {
    id: "kind",
    header: "Kind",
    value: (row) => row.kind,
    cell: (row) => <span className="text-muted-foreground">{row.kind}</span>,
  },
  {
    id: "plugin",
    header: "Plugin",
    value: (row) => row.plugin.id,
    cell: (row) => <PluginChip pluginId={row.plugin.id} />,
  },
];

function rows(entries: FacetTableEntry[]): ExemptionRow[] {
  return entries.flatMap((entry) =>
    (entry.data as ExemptionsData).declared.map((e) => ({
      plugin: entry.node,
      rule: e.rule,
      paths: e.paths.join(", "),
      kind: e.kind,
    })),
  );
}

export const exemptionsFacetTable = defineFacetTable<ExemptionRow>({
  facetId: "exemptions",
  label: "Exemptions",
  icon: ruleIcon,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.id}:${r.rule}:${r.paths}`,
});
