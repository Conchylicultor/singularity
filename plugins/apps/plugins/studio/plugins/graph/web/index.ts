import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHub } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { graphCanvasPane } from "./panes";

export { graphCanvasPane } from "./panes";

export default {
  description:
    "Studio Plugin Graph pane: focused closure subgraph (deps + dependents) around a plugin, tinted by the active composition's membership, with depth / direction controls and click-to-recenter.",
  contributions: [
    Pane.Register({ pane: graphCanvasPane }),
    Studio.Sidebar({
      id: "graph",
      ...sidebarNavItem({
        title: "Plugin Graph",
        icon: MdHub,
        onClick: () => openPane(graphCanvasPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
