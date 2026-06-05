import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { ContributionsDetailSection } from "./components/contributions-detail-section";

export default {
  name: "Contributions: Detail Section",
  description: "Per-plugin contributions section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "contributions",
      label: "Contributions",
      component: ContributionsDetailSection,
    }),
  ],
} satisfies PluginDefinition;
