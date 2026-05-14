import type { PluginDefinition } from "@core";
import { MdTableChart } from "react-icons/md";
import { Catalog, countFlat } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { TablesTable } from "./components/tables-table";

export { TableDetail } from "./slots";

export default {
  id: "catalog-tables",
  name: "Forge: Catalog / Tables",
  description:
    "DB tables catalog tab with an extensible per-table detail slot.",
  contributions: [
    Catalog.Category({
      id: "tables",
      label: "Tables",
      icon: MdTableChart,
      getCount: (plugins) => countFlat(plugins, (p) => p.publicApi?.tables ?? []),
      component: TablesTable,
    }),
  ],
} satisfies PluginDefinition;
