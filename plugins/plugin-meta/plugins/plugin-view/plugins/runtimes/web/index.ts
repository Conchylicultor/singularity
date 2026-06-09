import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { RuntimesSection } from "./components/runtimes-section";

export default {
  description: "Displays runtime pills (web/server/central) in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "runtimes", label: "Runtimes", component: RuntimesSection }),
  ],
} satisfies PluginDefinition;
