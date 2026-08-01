import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  RoutesCount,
  RoutesDetailSection,
  useRoutesAvailable,
} from "./components/routes-detail-section";

export default {
  description: "Per-plugin routes section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "routes",
      label: "Routes",
      component: RoutesDetailSection,
      summary: RoutesCount,
      useAvailable: useRoutesAvailable,
    }),
  ],
} satisfies PluginDefinition;
