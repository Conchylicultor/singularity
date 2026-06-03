import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { IndexesSection } from "./components/indexes-section";

export default {
  name: "Forge: Catalog / Tables / Indexes",
  description: "Table indexes section in the table detail view.",
  contributions: [
    TableDetail.Section({ id: "indexes", label: "Indexes", component: IndexesSection }),
  ],
} satisfies PluginDefinition;
