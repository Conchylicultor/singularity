import type { PluginDefinition } from "@core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { PublicApiSection } from "./components/public-api-section";

export default {
  id: "public-api",
  name: "Plugin View: Public API",
  description:
    "Displays the plugin's public exports, slots, routes, and consumer relationships.",
  contributions: [
    PluginViewSlots.Section({
      id: "public-api",
      label: "Public API",
      component: PublicApiSection,
    }),
  ],
} satisfies PluginDefinition;
