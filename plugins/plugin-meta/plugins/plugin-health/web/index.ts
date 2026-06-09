import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { HealthSection } from "./components/health-section";

export default {
  description:
    "Displays health review status and staleness in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "health",
      label: "Health",
      component: HealthSection,
    }),
  ],
} satisfies PluginDefinition;
