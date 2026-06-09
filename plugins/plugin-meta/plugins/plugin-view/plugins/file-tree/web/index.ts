import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { FileTreeSection } from "./components/file-tree-section";

export default {
  description: "File tree explorer for the plugin's own files in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "file-tree", label: "Files", component: FileTreeSection }),
  ],
} satisfies PluginDefinition;
