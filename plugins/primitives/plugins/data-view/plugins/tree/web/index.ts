import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdAccountTree } from "react-icons/md";
import { DataViewSlots } from "@plugins/primitives/plugins/data-view/web";
import { TreeView } from "./components/tree-view";

export type { TreeViewOptions, TreeRowNode } from "./internal/types";

export default {
  description:
    "Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).",
  contributions: [
    DataViewSlots.View({
      type: "tree",
      title: "Tree",
      icon: MdAccountTree,
      order: 2,
      hierarchical: true,
      // Defaults to manual (rank) order — the DnD-reorderable order the tree
      // ships. Picking a field sort reorders each sibling group by that field
      // (and suspends DnD while active). Sort applies per-sibling, preserving
      // hierarchy. Group-by partitions the ROOTS into sections (children follow
      // their root) and likewise suspends DnD while active — default flags for
      // both.
      supportsSort: true,
      loadingVariant: "rows",
      component: TreeView,
    }),
  ],
} satisfies PluginDefinition;
