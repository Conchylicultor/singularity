import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TabBarSlots } from "@plugins/ui/plugins/tab-bar/web";
import { ChipTab } from "./components/chip-tab";

export default {
  description: "Accent-filled pill tab (the canonical chip look).",
  contributions: [
    TabBarSlots.Variant({
      id: "chip",
      label: "Chip",
      match: "chip",
      component: ChipTab,
    }),
  ],
} satisfies PluginDefinition;
