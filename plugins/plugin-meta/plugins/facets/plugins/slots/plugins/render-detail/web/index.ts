import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  SlotsCount,
  SlotsDetailSection,
  useSlotsAvailable,
} from "./components/slots-detail-section";

export default {
  description: "Per-plugin slots section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "slots",
      label: "Slots",
      component: SlotsDetailSection,
      summary: SlotsCount,
      useAvailable: useSlotsAvailable,
    }),
  ],
} satisfies PluginDefinition;
