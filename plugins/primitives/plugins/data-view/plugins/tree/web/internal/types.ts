import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
import type { ReactNode } from "react";
import type {
  RowChromeMenuHelpers,
  RowMenuItem,
} from "@plugins/primitives/plugins/tree/web";

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
  /** Leading icon rendered immediately before the primary-field label. */
  leadingIcon?: (row: TRow) => ReactNode;
  /**
   * Persistent trailing content rendered after the label (a status badge, count,
   * etc.). Always visible — distinct from `itemActions`, which are interactive
   * affordances revealed on row hover.
   */
  trailing?: (row: TRow) => ReactNode;
  /**
   * Full-row accent/background layer for a row (e.g. a translucent membership
   * wash). Rendered by RowChrome into a primitive-owned `absolute inset-0`
   * layer painted over the row, so a translucent overlay composes with the
   * hover/selected backgrounds. A first-class alternative to faking a full-row
   * background inside `trailing`.
   */
  rowAccent?: (row: TRow) => ReactNode;
  /** Drag-handle dropdown menu items for a row → `RowChrome.menu`. */
  rowMenu?: (helpers: RowChromeMenuHelpers, row: TRow) => RowMenuItem[];
  /** Content shown in the floating chip while a row is being dragged. */
  dragOverlay?: (row: TRow) => ReactNode;
  /** Root-level "Add" button label. `null` hides it (default when no `onCreate`). */
  addLabel?: string | null;
  /** Scope the tree to a subtree rooted at this id (hides the root Add button). */
  rootId?: string;
  /** Show the expand-all/collapse-all toolbar button. */
  expandAll?: boolean;
  /**
   * Default expansion for nodes with no entry in the view's own expand map (i.e.
   * the user has never toggled them). `true` opens every node by default — for
   * small, derived trees whose point is to show the whole set — while staying
   * collapsible (a user toggle still wins). Default `false`.
   */
  defaultExpanded?: boolean;
  /**
   * Rows for which activating (body-clicking) the row toggles its expansion
   * instead of activating it — the "click a folder to open it" affordance
   * (`onRowActivate` never fires for such a row). Stateless: it routes the
   * gesture only; expand state still lives in the view's own expand map.
   * Absent → every row activates, the default. Alias rows never toggle.
   */
  expandOnActivate?: (row: TRow) => boolean;
  /** Extra content rendered on the left of the tree's own toolbar row. */
  toolbarStart?: ReactNode;
  /** Per-row label className (e.g. done/dropped strikethrough styling). */
  labelClassName?: (row: TRow) => ClassName | undefined;
}
