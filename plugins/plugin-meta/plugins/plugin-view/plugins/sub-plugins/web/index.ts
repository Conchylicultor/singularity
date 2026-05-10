import type { PluginDefinition } from "@core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { SubPluginsSection } from "./components/sub-plugins-section";

export default {
  id: "sub-plugins",
  name: "Plugin View: Sub-plugins",
  description: "Lists direct child plugins with load-bearing indicators in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "sub-plugins", order: 20, component: SubPluginsSection }),
  ],
} satisfies PluginDefinition;
