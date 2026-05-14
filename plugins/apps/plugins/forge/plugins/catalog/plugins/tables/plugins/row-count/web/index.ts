import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { RowCountSection } from "./components/row-count-section";

export default {
  id: "catalog-tables-row-count",
  name: "Forge: Catalog / Tables / Row Count",
  description:
    "Live row count section (estimated from pg_stat_user_tables) in the table detail view.",
  contributions: [
    TableDetail.Section({
      id: "row-count",
      label: "Row Count",
      component: RowCountSection,
    }),
  ],
} satisfies PluginDefinition;
