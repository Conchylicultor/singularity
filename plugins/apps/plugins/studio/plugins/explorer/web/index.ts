import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdAccountTree } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { explorerPane } from "./panes";

export { Explorer } from "./slots";
export type { TreeRowBadgeContribution } from "./slots";
export { usePluginTree } from "./context";

export default {
  name: "Studio: Explorer",
  description:
    "Sidebar entry and filterable tree pane for browsing and inspecting the plugin tree.",
  contributions: [
    Pane.Register({ pane: explorerPane }),
    Studio.Sidebar({
      id: "explorer",
      ...sidebarNavItem({ title: "Explorer", icon: MdAccountTree, onClick: () => openPane(explorerPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
