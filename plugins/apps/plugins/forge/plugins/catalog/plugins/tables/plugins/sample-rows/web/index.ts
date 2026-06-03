import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { SampleRowsSection } from "./components/sample-rows-section";

export default {
  name: "Forge: Catalog / Tables / Sample Rows",
  description: "Sample rows section (first 10 rows) in the table detail view.",
  contributions: [
    TableDetail.Section({
      id: "sample-rows",
      label: "Sample Rows",
      component: SampleRowsSection,
    }),
  ],
} satisfies PluginDefinition;
