import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { ResourcesDetailSection } from "./components/resources-detail-section";

export default {
  description: "Per-plugin resources section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "resources",
      label: "Resources",
      component: ResourcesDetailSection,
    }),
  ],
} satisfies PluginDefinition;
