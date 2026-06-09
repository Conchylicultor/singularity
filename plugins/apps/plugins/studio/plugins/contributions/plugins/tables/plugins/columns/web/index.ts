import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/studio/plugins/contributions/plugins/tables/web";
import { ColumnsSection } from "./components/columns-section";

export default {
  description: "Table column definitions section in the table detail view.",
  contributions: [
    TableDetail.Section({
      id: "columns",
      label: "Columns",
      component: ColumnsSection,
    }),
  ],
} satisfies PluginDefinition;
