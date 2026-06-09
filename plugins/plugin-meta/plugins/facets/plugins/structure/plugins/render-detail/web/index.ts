import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { StructureDetailSection } from "./components/structure-detail-section";

export default {
  description: "Per-plugin structure section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "structure",
      label: "Structure",
      component: StructureDetailSection,
    }),
  ],
} satisfies PluginDefinition;
