import type { PluginDefinition } from "@core";
import { TableDetail } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { ColumnsSection } from "./components/columns-section";

export default {
  id: "catalog-tables-columns",
  name: "Forge: Catalog / Tables / Columns",
  description: "Table column definitions section in the table detail view.",
  contributions: [
    TableDetail.Section({
      id: "columns",
      label: "Columns",
      component: ColumnsSection,
    }),
  ],
} satisfies PluginDefinition;
