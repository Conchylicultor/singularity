import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTableChart } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Catalog, countFlat } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { TablesTable } from "./components/tables-table";
import { tableDetailPane } from "./panes";

export { TableDetail } from "./slots";
export { tableDetailPane } from "./panes";

export default {
  id: "catalog-tables",
  name: "Forge: Catalog / Tables",
  description:
    "DB tables catalog tab with an extensible per-table detail slot.",
  contributions: [
    Pane.Register({ pane: tableDetailPane }),
    Catalog.Category({
      match: "tables",
      id: "tables",
      label: "Tables",
      icon: MdTableChart,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.tables ?? []),
      component: TablesTable,
    }),
  ],
} satisfies PluginDefinition;
