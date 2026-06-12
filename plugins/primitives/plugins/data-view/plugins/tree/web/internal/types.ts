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
  /** Hover-revealed trailing actions for a row → `RowChrome.actions`. */
  renderItemActions?: (row: TRow) => ReactNode;
  /** Drag-handle dropdown menu items for a row → `RowChrome.menu`. */
  rowMenu?: (helpers: RowChromeMenuHelpers, row: TRow) => RowMenuItem[];
  /** Content shown in the floating chip while a row is being dragged. */
  dragOverlay?: (row: TRow) => ReactNode;
  /** Root-level "Add" button label. `null` hides it (default when no `onCreate`). */
  addLabel?: string | null;
}
