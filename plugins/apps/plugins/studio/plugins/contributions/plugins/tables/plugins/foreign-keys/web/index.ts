import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/studio/plugins/contributions/plugins/tables/web";
import { ForeignKeysSection } from "./components/foreign-keys-section";

export default {
  name: "Studio: Contributions / Tables / Foreign Keys",
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
