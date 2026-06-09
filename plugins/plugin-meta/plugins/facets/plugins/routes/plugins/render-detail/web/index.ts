import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { RoutesDetailSection } from "./components/routes-detail-section";

export default {
  description: "Per-plugin routes section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "routes",
      label: "Routes",
      component: RoutesDetailSection,
    }),
  ],
} satisfies PluginDefinition;
