import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { CrossRefsDetailSection } from "./components/cross-refs-detail-section";

export default {
  name: "Cross-refs: Detail Section",
  description: "Per-plugin cross-refs section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "cross-refs",
      label: "Cross-refs",
      component: CrossRefsDetailSection,
    }),
  ],
} satisfies PluginDefinition;
