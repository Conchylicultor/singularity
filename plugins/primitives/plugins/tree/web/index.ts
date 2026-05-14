import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TreeList, hideTerminalSubtrees } from "./internal/tree-list";
export type { TreeListProps } from "./internal/tree-list";
export { RowChrome } from "./internal/row-chrome";
export type {
  RowChromeProps,
  RowChromeMenuHelpers,
  RowMenuItem,
} from "./internal/row-chrome";
export { RenameInput } from "./internal/rename-input";
export type { RenameInputProps } from "./internal/rename-input";
export {
  useTreeRow,
  useTreeListContext,
} from "./internal/use-tree-row";
export type {
  RowControls,
  TreeListContextValue,
} from "./internal/use-tree-row";
export type { TreeItem } from "./internal/types";

export default {
  id: "tree",
  name: "Tree",
  description:
    "Tree hierarchy utilities (buildTree, isDescendant, computeDrop) and a generic TreeList with composable row primitives (RowChrome, RenameInput, useTreeRow) for list plugins.",
  contributions: [],
} satisfies PluginDefinition;
