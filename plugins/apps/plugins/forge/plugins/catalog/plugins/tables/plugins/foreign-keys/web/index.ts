import type { PluginDefinition } from "@core";
import { TableDetail } from "@plugins/apps/plugins/forge/plugins/catalog/plugins/tables/web";
import { ForeignKeysSection } from "./components/foreign-keys-section";

export default {
  id: "catalog-tables-foreign-keys",
  name: "Forge: Catalog / Tables / Foreign Keys",
  description:
    "FK relationships section (outgoing and incoming) in the table detail view.",
  contributions: [
    TableDetail.Section({
      id: "foreign-keys",
      label: "Foreign Keys",
      component: ForeignKeysSection,
    }),
  ],
} satisfies PluginDefinition;
