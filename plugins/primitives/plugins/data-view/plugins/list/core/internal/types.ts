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
  /**
   * Rows per item: 1 (default) puts title and subtitle on one line; 2 stacks the
   * subtitle under the title — for surfaces whose subtitle is prose, not chips.
   *
   * One line is the default because the field-driven subtitle is a `·`-joined
   * run of short values (a status, a trigger, a relative time), and stacking it
   * makes a row read as twice the content it carries. A surface whose subtitle
   * is a sentence — where the second line is genuinely a second thought — opts
   * back in with `2`.
   */
  lines?: 1 | 2;
  /**
   * Row density. Default follows the surface's `DataViewProps.density`:
   * "sm" when the surface declared itself compact, "md" otherwise. Set it here
   * to pin a density regardless of what the surface asked for.
   */
  size?: "sm" | "md";
}
