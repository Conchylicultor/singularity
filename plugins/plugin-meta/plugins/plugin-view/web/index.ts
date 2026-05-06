import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "./panes";

export { pluginViewPane } from "./panes";
export type { PluginNode, PluginTreePayload } from "../shared/types";

export default {
  id: "plugin-view",
  name: "Plugin View",
  description:
    "Reusable detail pane for inspecting a single plugin — runtimes, sub-plugins, source path.",
  contributions: [Pane.Register({ pane: pluginViewPane })],
} satisfies PluginDefinition;
