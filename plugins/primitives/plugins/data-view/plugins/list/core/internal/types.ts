import type { ReactNode } from "react";

/**
 * Per-view options for the list view, threaded through
 * `DataViewProps.viewOptions.list` and surfaced as the opaque
 * `DataViewRenderProps.options`.
 */
export interface ListViewOptions<TRow> {
  /** Leading slot per row (icon / avatar / status-dot). */
  leading?: (row: TRow) => ReactNode;
  /**
   * Full row-body override (escape hatch). Owns its own content; still wrapped
   * in the selectable/clickable <Row>.
   */
  renderRow?: (row: TRow) => ReactNode;
  /** Row density. Default "md". */
  size?: "sm" | "md";
}
