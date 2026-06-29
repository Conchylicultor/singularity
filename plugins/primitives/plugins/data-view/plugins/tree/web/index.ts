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
      supportsSort: false,
      loadingVariant: "rows",
      component: TreeView,
    }),
  ],
} satisfies PluginDefinition;
