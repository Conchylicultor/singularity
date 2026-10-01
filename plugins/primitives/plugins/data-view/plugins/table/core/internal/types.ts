/**
 * Per-view options for the table view, passed via
 * `DataViewProps.viewOptions["table"]` (a `viewOptions={{ table: { … } }}`
 * literal — never import this view child).
 */
export interface TableViewOptions {
  /**
   * Where the column labels sit. `"row"` (default) is the sticky column-header
   * row. `"first-group"` drops that row and puts the labels on the FIRST group
   * header instead: the group's label spans the leading unlabelled columns and
   * each labelled column's header sits in its own track (aligned with the
   * cells, sort-on-click kept). Ungrouped — or when the first column is itself
   * labelled — it falls back to `"row"`. Pairs with `FieldDef.header: false`
   * to leave the leading columns unlabelled. See `data-table`'s
   * `DataTableColumnHeader`.
   */
  columnHeader?: "row" | "first-group";
}
