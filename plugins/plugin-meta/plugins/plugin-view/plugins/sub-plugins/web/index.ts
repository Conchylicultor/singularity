import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  SubPluginsCount,
  SubPluginsSection,
  useSubPluginsAvailable,
} from "./components/sub-plugins-section";

export default {
  description: "Lists direct child plugins with load-bearing indicators in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "sub-plugins",
      label: "Sub-plugins",
      component: SubPluginsSection,
      summary: SubPluginsCount,
      useAvailable: useSubPluginsAvailable,
    }),
  ],
} satisfies PluginDefinition;
