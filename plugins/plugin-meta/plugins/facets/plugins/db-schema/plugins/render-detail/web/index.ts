import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  DbSchemaCount,
  DbSchemaDetailSection,
  useDbSchemaAvailable,
} from "./components/db-schema-detail-section";

export default {
  description: "Per-plugin db-schema section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "db-schema",
      label: "Database",
      component: DbSchemaDetailSection,
      summary: DbSchemaCount,
      useAvailable: useDbSchemaAvailable,
    }),
  ],
} satisfies PluginDefinition;
