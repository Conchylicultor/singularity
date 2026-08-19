import { Tree } from "./slots";
import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { TreeList } from "./internal/tree-list";
export type { TreeListProps } from "./internal/tree-list";
export { RowChrome } from "./internal/row-chrome";
export type {
  RowChromeProps,
  RowChromeMenuHelpers,
  RowMenuItem,
} from "./internal/row-chrome";
export { TreeRowChrome } from "./internal/tree-row-chrome";
export type { TreeRowChromeProps } from "./internal/tree-row-chrome";
export { TreeDisclosureToggle } from "./internal/tree-disclosure-toggle";
export type { TreeDisclosureToggleProps } from "./internal/tree-disclosure-toggle";
export { Tree } from "./slots";
export type { TreeDisclosureContribution } from "./slots";
export { RenameInput } from "./internal/rename-input";
export type { RenameInputProps } from "./internal/rename-input";
export {
  useTreeRow,
  useTreeListContext,
  useOptionalTreeListContext,
  useOptionalRowControls,
} from "./internal/use-tree-row";
export type {
  RowControls,
  TreeListContextValue,
} from "./internal/use-tree-row";
export type { TreeItem } from "./internal/types";

export { useSubtreeExpandAll } from "./internal/use-subtree-expand-all";
export type {
  ExpandableRow,
  UseSubtreeExpandAllReturn,
} from "./internal/use-subtree-expand-all";

export default {
  description:
    "Tree hierarchy utilities (buildTree, isDescendant, resolveDropParent) and a generic TreeList with composable row primitives (RowChrome, RenameInput, useTreeRow) for list plugins.",
  contributions: [],
  slots: Tree,
} satisfies PluginDefinition;
