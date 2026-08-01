import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  ContributionsCount,
  ContributionsDetailSection,
  useContributionsAvailable,
} from "./components/contributions-detail-section";

export default {
  description: "Per-plugin contributions section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "contributions",
      label: "Contributions",
      component: ContributionsDetailSection,
      summary: ContributionsCount,
      useAvailable: useContributionsAvailable,
    }),
  ],
} satisfies PluginDefinition;
