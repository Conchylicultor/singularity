import type { PluginDefinition } from "@core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { HealthSection } from "./components/health-section";

export default {
  id: "plugin-health",
  name: "Plugin Health",
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
