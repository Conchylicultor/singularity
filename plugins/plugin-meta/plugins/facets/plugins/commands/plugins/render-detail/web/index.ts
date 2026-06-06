import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { CommandsDetailSection } from "./components/commands-detail-section";

export default {
  name: "Commands: Detail Section",
  description: "Per-plugin commands section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "commands",
      label: "Commands",
      component: CommandsDetailSection,
    }),
  ],
} satisfies PluginDefinition;
