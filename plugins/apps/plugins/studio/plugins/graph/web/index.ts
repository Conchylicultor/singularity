import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { graphCanvasPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { graphCanvasPane } from "./panes";

export default {
  description:
    "Studio Plugin Graph pane: focused closure subgraph (deps + dependents) around a plugin, tinted by the active composition's membership, with depth / direction controls and click-to-recenter.",
  contributions: [
    Pane.Register({ pane: graphCanvasPane }),
    Studio.Sidebar({
      id: "graph",
      title: "Plugin Graph",
      icon: symbol("hub"),
      onClick: () => openPane(graphCanvasPane, {}, { mode: "root" }),
    }),
  ],
  slots: { graph: graphCanvasPane },
} satisfies PluginDefinition;
