import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "./panes";

export { pluginViewPane } from "./panes";
export { PluginDetail } from "./components/plugin-detail";
export { Section } from "./components/section";
export { PluginView as PluginViewSlots } from "./slots";
export type { PluginNode, PluginTreePayload } from "../core/types";
export { RUNTIME_COLORS } from "./runtime-colors";
export type { ExportRuntime } from "./runtime-colors";

export default {
  id: "plugin-view",
  name: "Plugin View",
  description:
    "Reusable detail pane for inspecting a single plugin. Defines PluginView.Section slot for extensible sections.",
  contributions: [Pane.Register({ pane: pluginViewPane })],
} satisfies PluginDefinition;
