import type { PluginDefinition } from "@core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { SourcePathSection } from "./components/source-path-section";

export default {
  id: "source-path",
  name: "Plugin View: Source Path",
  description: "Displays the plugin's source path in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "source-path", label: "Source Path", component: SourcePathSection }),
  ],
} satisfies PluginDefinition;
