import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { StructureSection } from "./components/structure-section";

export default {
  name: "Plugin View: Structure",
  description:
    "Flags non-standard folders, stray top-level source files, and composition roots in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({ id: "structure", label: "Structure", component: StructureSection }),
  ],
} satisfies PluginDefinition;
