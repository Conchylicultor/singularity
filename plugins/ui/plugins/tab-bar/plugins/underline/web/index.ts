import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TabBarSlots } from "@plugins/ui/plugins/tab-bar/web";
import { UnderlineTab } from "./components/underline-tab";

export default {
  description: "Flat tab; the active tab is underlined flush with the bar.",
  contributions: [
    TabBarSlots.Variant({
      id: "underline",
      label: "Underline",
      match: "underline",
      component: UnderlineTab,
    }),
  ],
} satisfies PluginDefinition;
