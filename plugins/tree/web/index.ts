import type { PluginDefinition } from "@core";

export { TreeList } from "./internal/tree-list";
export type {
  TreeListProps,
  TreeItem,
  RowContext,
  RowMenuItem,
} from "./internal/tree-list";

export default {
  id: "tree",
  name: "Tree",
  description:
    "Tree hierarchy utilities (buildTree, isDescendant, computeDrop) and a generic TreeList component for list plugins.",
  contributions: [],
} satisfies PluginDefinition;
