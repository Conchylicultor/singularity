import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdAccountTree } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { explorerPane } from "./panes";

export { Explorer } from "./slots";
export type { TreeRowBadgeContribution } from "./slots";
export { usePluginTree } from "./context";
// Exported so sibling Studio panes (e.g. compositions) can open the tinted
// Explorer tree alongside their own controls via openPane. The pane object is a
// pure factory; registration still happens via the Pane.Register below.
export { explorerPane } from "./panes";
// Exported so sibling Studio surfaces (the compositions closure-tree section) can render the
// tinted tree inline. Standalone: {plugins, selected, onSelect, storageKey?} — no pane
// coupling. Explorer never imports compositions → DAG-safe.
export { PluginTree } from "./components/plugin-tree";

export default {
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
