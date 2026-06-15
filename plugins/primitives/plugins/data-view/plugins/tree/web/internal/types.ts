import type { ReactNode } from "react";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type {
  RowChromeMenuHelpers,
  RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";

/** The projected tree row: the original `TRow` plus the `TreeItem` id field. */
export type TreeRowNode<TRow> = TreeNode<TRow & { id: string }>;

/**
 * Per-view options for the tree view, threaded through
 * `DataViewProps.viewOptions.tree` and surfaced as the opaque
 * `DataViewRenderProps.options`. The tree row chrome (`RowChrome`) already owns
 * `actions` / `menu`; these map 1:1 onto it (no parallel system).
 *
 * Lives in `web` (not `core`) because `RowMenuItem` / `RowChromeMenuHelpers`
 * are web types of the tree primitive, and `core` may not import `web`.
 */
export interface TreeViewOptions<TRow> {
  /** Fully replace a row's rendering (receives the projected tree node). */
  renderRow?: (node: TreeRowNode<TRow>) => ReactNode;
  /** Leading icon rendered immediately before the primary-field label. */
  leadingIcon?: (row: TRow) => ReactNode;
  /** Drag-handle dropdown menu items for a row → `RowChrome.menu`. */
  rowMenu?: (helpers: RowChromeMenuHelpers, row: TRow) => RowMenuItem[];
  /** Content shown in the floating chip while a row is being dragged. */
  dragOverlay?: (row: TRow) => ReactNode;
  /** Root-level "Add" button label. `null` hides it (default when no `onCreate`). */
  addLabel?: string | null;
  /** Scope the tree to a subtree rooted at this id (hides the root Add button). */
  rootId?: string;
  /** Hide fully-terminal subtrees (e.g. done/dropped) behind a toolbar toggle. */
  hideTerminal?: { isTerminal: (row: TRow) => boolean };
  /** Show the expand-all/collapse-all toolbar button. */
  expandAll?: boolean;
  /** Extra content rendered on the left of the tree's own toolbar row. */
  toolbarStart?: ReactNode;
  /** Per-row label className (e.g. done/dropped strikethrough styling). */
  labelClassName?: (row: TRow) => string | undefined;
}
