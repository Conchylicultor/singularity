import type { PluginDefinition } from "@core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { RuntimesSection } from "./components/runtimes-section";

export default {
  id: "runtimes",
  name: "Plugin View: Runtimes",
  description: "Displays runtime pills (web/server/central) in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "runtimes", order: 10, component: RuntimesSection }),
  ],
} satisfies PluginDefinition;
