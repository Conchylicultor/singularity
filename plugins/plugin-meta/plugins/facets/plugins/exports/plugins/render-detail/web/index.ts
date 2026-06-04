import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { ExportsDetailSection } from "./components/exports-detail-section";

export default {
  name: "Exports: Detail Section",
  description: "Per-plugin exports section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "exports",
      label: "Exports",
      component: ExportsDetailSection,
    }),
  ],
} satisfies PluginDefinition;
