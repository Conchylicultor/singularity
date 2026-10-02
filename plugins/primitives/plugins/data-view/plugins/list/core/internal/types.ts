import type { ReactNode } from "react";
import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";

/**
 * Per-view options for the list view, threaded through
 * `DataViewProps.viewOptions.list` and surfaced as the opaque
 * `DataViewRenderProps.options`.
 */
export interface ListViewOptions<TRow> {
  /** Leading slot per row (icon / avatar / status-dot), rendered after the
   *  schema's leading field (`FieldDef.leading`), if any. */
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
  /**
   * The chrome each row is drawn with. `"row"` (default) is the `Row`
   * primitive. `"tree"` draws every row through the tree primitive's
   * `TreeRowChrome` at depth 0 — its height (`treeRowH`), indent, icon box,
   * hover, selected tier and action cluster — so a flat list shown beside a
   * tree of the same records (Pages' Favorites over its page tree) is the
   * same row by construction, not a second hand-tuned look. In this chrome a
   * row is one label line: the title (its read rendering — never the
   * click-to-edit cell, since the label is the row's navigation target)
   * truncates and every other body field
   * renders as a rigid inline cell after it, exactly as the tree view draws
   * its secondary fields; `lines` does not apply.
   */
  rowChrome?: "row" | "tree";
  /**
   * Per-row title className, composed after the row tone — the list twin of
   * the tree view's `labelClassName` (e.g. the open record's row in a heavier
   * weight).
   */
  labelClassName?: (row: TRow) => ClassName | undefined;
}
