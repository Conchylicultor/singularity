import {
  defineFacetTable,
  type FacetTableEntry,
  PluginChip,
} from "@plugins/apps/plugins/forge/plugins/catalog/web";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { DocMetaRegistration } from "@plugins/plugin-meta/plugins/facets/plugins/registrations/core";
import { MdAppRegistration } from "react-icons/md";

type RegistrationRow = {
  plugin: PluginNode;
  name: string;
  kind: string;
  runtime: string;
};

function format(r: DocMetaRegistration): string {
  if (!r.factory) return r.doc.label ?? r.kind;
  return r.doc.label ? `${r.factory}('${r.doc.label}')` : `${r.factory}()`;
}

const columns: ColumnDef<RegistrationRow>[] = [
  {
    id: "name",
    header: "Registration",
    width: "flex-1 min-w-0",
    value: (row) => row.name,
    cell: (row) => (
      <code className="truncate font-mono text-foreground">{row.name}</code>
    ),
  },
  {
    id: "kind",
    header: "Kind",
    value: (row) => row.kind,
    cell: (row) => (
      <span className="font-mono text-muted-foreground">{row.kind}</span>
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

function rows(entries: FacetTableEntry[]): RegistrationRow[] {
  const result: RegistrationRow[] = [];
  for (const entry of entries) {
    const data = entry.data as DocMetaRegistration[];
    for (const r of data) {
      result.push({
        plugin: entry.node,
        name: format(r),
        kind: r.kind,
        runtime: r.runtime,
      });
    }
  }
  return result;
}

export const registrationsFacetTable = defineFacetTable<RegistrationRow>({
  facetId: "registrations",
  label: "Registrations",
  icon: MdAppRegistration,
  columns,
  rows,
  rowKey: (r) => `${r.plugin.hierarchyId}:${r.runtime}:${r.name}`,
});
