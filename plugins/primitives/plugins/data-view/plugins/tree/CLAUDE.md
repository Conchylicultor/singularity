# tree

The **tree** view child of the `data-view` primitive. Contributes one
`DataViewSlots.View("tree")` entry (`hierarchical: true`, `supportsSort: true`):
a nested, draggable, inline-renameable tree rendered through the shared
`FieldDef` schema. It **defaults to manual (rank) order** — the DnD-reorderable
order the tree ships — and honors `ViewState.sort` when a field sort is picked
(see "Sort" below). It also honors **filter**, subtree-preserving.

## What it is

A thin **adapter**, not a reimplementation. It projects the data-view rows plus
the data source's `HierarchyConfig` onto the `tree` primitive's `TreeList`,
reusing `buildTree`, subtree-preserving `filterTree` search, DnD `computeDrop`,
and the `RowChrome` / `RenameInput` row primitives. The `tree` primitive stays
the lower-level building block.

## How it works

- **Projection** — each raw `TRow` becomes a `TreeItem`-shaped row
  (`{ id, parentId, rank, expanded, __row }`) via the `HierarchyConfig`
  accessors. A map back to the original row lets `TreeList` callbacks recover the
  concrete `TRow`.
- **Row label** — the primary field (`FieldDef.primary` → first `text` → first,
  run via `pickPrimaryField` over the view's **visible** field subset) rendered
  through the same `data-view.cell` resolution the table uses, so a field-type
  plugin's cell renders identically as a table column and a tree row. When the
  primary field declares `onEdit`/`onEditValues`, the label becomes an
  `EditableTreeLabel` (select-then-edit over the shared `useResolveCellEditor`
  capability — the same per-type editors the table uses); otherwise it stays a
  read-only cell.
- **Secondary fields** — the body is no longer label-only. The row renders the
  primary field as the label **plus** the remaining visible fields (the view's
  `visibleFields` minus the primary; **default = all non-primary fields**) as
  read-only trailing chips, each through the same per-type cell resolution as the
  label, sitting before any `options.trailing`. Author a narrow `visibleFields`
  (e.g. `["label"]`) to keep the tree body to just the label and leave the other
  fields filter-only — see the data-view CLAUDE.md "Per-view visible fields
  (Properties)" / "Filtering" sections. Inline-editing a secondary field's value
  directly in the dense tree row is a follow-up — the chips are **read-only in
  v1** (edit those values in the table/list view).
- **Search** — the host's `searchAccessor` (when supplied) drives the tree's
  subtree-preserving `filterTree`; otherwise it falls back to the primary-field
  label. Threaded through the controlled `toolbar.search.query` + `hideInput` of
  `TreeList` (ancestors retained). Pass a `searchAccessor` that folds in ancestor
  names / secondary fields to match on more than the label.
- **Filter** — the view's `state.filter` is applied through the same
  `evaluateNode` evaluator the flat views use, so filter semantics are identical
  across every view. Filtering is subtree-preserving (mirrors search): a node
  survives if it matches or has a matching descendant — matches plus the ancestor
  chain of each match — so filtered rows keep their hierarchical context instead
  of being orphaned to the root. Evaluation lives in this adapter (not the
  generic `tree` primitive) because it needs the `FieldDef` schema + per-type
  operator sets, which are a data-view concern.
- **Sort** — **defaults to manual (rank) order**: an empty `ViewState.sort`
  resolves to a `null` comparator (`makeSortComparator`), so the projected rows
  keep their incoming rank order — the order DnD reorders. Picking a field sort
  reorders each **sibling group** by that field: because `buildTree` preserves
  each parent's incoming child order, a single **stable global sort** of the flat
  projected list (by the same multi-level comparator the flat views use) lands
  every sibling group in comparator order, with rank as the final tie-break — so
  hierarchy is preserved. While a field sort is active the rank order is
  overridden, so **DnD reorder is suspended** (`onMove` is dropped, matching
  Notion — clear the sort back to Manual to drag); `onCreate` stays enabled.
- **Expand state** — server-persisted when `hierarchy.isExpanded` /
  `onToggleExpanded` are supplied; otherwise managed in local component state
  for the session (`DataViewRenderProps` does not expose `ViewState.setExpanded`).
- **Read-only sources** — when `onMove` / `onCreate` are omitted (and the primary
  field declares no `onEdit`) the
  view passes no handler to `TreeList`, so the row's drag source, every Add
  affordance, and inline rename genuinely disappear (no inert placeholders).

## Options

`options` (= `viewOptions.tree`) is a `TreeViewOptions<TRow>`:

- `renderRow?(node, depth)` — fully replace a row's rendering. Receives the
  projected tree node and its `depth` (so a custom row can compose `RowChrome`,
  which needs `depth` for nested-row indentation).
- `rowAccent?(row)` — a first-class full-row accent/background layer (e.g. a
  translucent membership wash). Rendered by the tree primitive's `RowChrome` into
  a primitive-owned `absolute inset-0` layer painted *over* the row, so a
  translucent overlay composes with the hover/selected backgrounds. Use this
  instead of faking a full-row background inside `trailing`.
- `leadingIcon?(row)` — icon rendered before the label.
- `trailing?(row)` — persistent content rendered after the label (status badge,
  count, …). Always visible — distinct from `itemActions`, which are hover-revealed.
- `rowMenu?(helpers, row)` — items for the row's hover-revealed "⋯" more-menu
  → `RowChrome.menu`. (The whole row is the drag source, Notion-style — there is
  no separate grip handle; this menu lives in the trailing actions cluster.)
- `dragOverlay?(row)` — content shown in the floating drag chip.
- `addLabel?` — root "Add" button label (`null` hides; default null when no `onCreate`).

Every row also renders a Notion-style hover-revealed "+" in its trailing actions
cluster (add-child), shown whenever the source supplies `hierarchy.onCreate`.
This replaces the old persistent "Add" line under expanded nodes — keeping the
tree compact. Pass `addLabel: null` to drop the root footer too and surface root
creation from your own chrome (e.g. a section-header "+").

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).
- Web:
  - Contributes: `DataViewSlots.View` "Tree" → `TreeView`
  - Uses: `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/ui-kit.cn`, `primitives/data-view.DataViewRenderProps`, `primitives/data-view.DataViewSlots`, `primitives/data-view.evaluateNode`, `primitives/data-view.FieldDef`, `primitives/data-view.HierarchyConfig`, `primitives/data-view.ItemActionsDescriptor`, `primitives/data-view.makeSortComparator`, `primitives/data-view.pickPrimaryField`, `primitives/data-view.resolveBodyFields`, `primitives/data-view.useResolveCell`, `primitives/data-view.useResolveCellEditor`, `primitives/data-view.useResolveOperatorSet`, `primitives/latest-ref.useLatestRef`, `primitives/tree.RowChrome`, `primitives/tree.RowChromeMenuHelpers`, `primitives/tree.RowMenuItem`, `primitives/tree.TreeItem`, `primitives/tree.TreeList`, `primitives/tree.useTreeListContext`, `primitives/tree.useTreeRow`
  - Exports: Types: `TreeRowNode`, `TreeViewOptions`

<!-- AUTOGENERATED:END -->
