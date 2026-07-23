# tree

The **tree** view child of the `data-view` primitive. Contributes one
`DataViewSlots.View("tree")` entry (`hierarchical: true`, `supportsSort: true`):
a nested, draggable, inline-renameable tree rendered through the shared
`FieldDef` schema. It **defaults to manual (rank) order** — the DnD-reorderable
order the tree ships — and honors `ViewState.sort` when a field sort is picked
(see "Sort" below). It also honors **filter**, subtree-preserving, and
**group-by** (see "Group-by" below).

## What it is

A thin **adapter**, not a reimplementation. It projects the data-view rows plus
the data source's `HierarchyConfig` onto the `tree` primitive's `TreeList`,
reusing `buildTree`, subtree-preserving `filterTree` search, DnD `computeDrop`,
and the `RowChrome` / `RenameInput` row primitives. The `tree` primitive stays
the lower-level building block.

## How it works

- **Projection** — each raw `TRow` becomes a `TreeItem`-shaped row
  (`{ id, parentId, rank, expanded, alias, __row }`) via the `HierarchyConfig`
  accessors. A map back to the original row lets `TreeList` callbacks recover the
  concrete `TRow`. It lives in `web/internal/project-rows.ts` as a **pure**
  function (the view just memoizes it), so its rank arithmetic — notably the
  alias minting below — is directly testable without mounting the view.
- **Row label** — the primary field (`FieldDef.primary` → first `text` → first,
  run via `pickPrimaryField` over the view's **visible** field subset) rendered on
  the same read precedence the shared `FieldCell` documents and every other view
  applies: consumer **`field.cell` override → contributed `data-view.cell` slot →
  `String(value)`**. So a field-type plugin's cell renders identically as a table
  column and a tree row, *and* a consumer whose rows are a heterogeneous union can
  render one kind's label as a whole component (e.g. a conversation row) via
  `field.cell`. When the primary field declares `onEdit`/`onEditValues` the label
  becomes an `EditableTreeLabel` (select-then-edit over the shared
  `useResolveCellEditor` capability, the same per-type editors the table uses)
  wrapping that same read node; otherwise it stays a read-only cell.
- **Secondary fields** — the body is no longer label-only. The row renders the
  primary field as the label **plus** the remaining visible fields (the view's
  `visibleFields` minus the primary; **default = all non-primary fields**) as
  trailing chips, each rendered through the shared `FieldCell` (the same per-type
  cell resolution the label and every other view use), sitting before any
  `options.trailing`. The chips are **no longer read-only**: a secondary field
  declaring `onEdit`/`onEditValues` (e.g. a custom column) is **click-to-edit**
  in place via `FieldCell` → `EditableCell` — the same per-type inline editors as
  the table/list, and `EditableCell`'s `stopPropagation` keeps a chip click from
  triggering row selection/navigation. Fields without a write-back stay
  read-only. Author a narrow `visibleFields` (e.g. `["label"]`) to keep the tree
  body to just the label and leave the other fields filter-only — see the
  data-view CLAUDE.md "Per-view visible fields (Properties)" / "Filtering"
  sections.
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
- **Group-by** — when the view sets `state.groupBy` to a groupable field, the
  **roots** partition into flat sections via the shared `partitionIntoSections`
  (enum-option section order + the "None" bucket for free), rendered through the
  shared `<GroupedSections>` chrome (pinned/stacking collapsible headers) with
  one `TreeList` per section. Every descendant follows its **root ancestor's**
  section regardless of its own field value (climbing `parentId` under the same
  orphan rule as `buildTree`); the header count is the section's root count. The
  per-list chrome renders exactly ONCE for the whole view: expand-all /
  `toolbarStart` are hoisted above the sections and the root Add footer below
  them, while the (hidden-input) search stays threaded into each per-section
  list. While grouped, **DnD reorder is suspended** like under sort: a
  per-section `TreeList` sees only its own section's roots, so a within-section
  root reorder could mint a rank colliding with a hidden root of another
  section (the documented filtered-projection hazard); `onCreate` stays
  enabled. An unset / unresolvable / value-less group field renders the exact
  ungrouped path. The pure pieces (orphan-rule roots, field adaptation onto the
  projected wrapper, children-follow-their-root bucketing) live in
  `web/internal/group-rows.ts`, bun-tested alongside `project-rows`.
- **Expand state** — server-persisted when `hierarchy.isExpanded` /
  `onToggleExpanded` are supplied; otherwise managed in local component state
  for the session (`DataViewRenderProps` does not expose `ViewState.setExpanded`).
- **Read-only sources** — when `onMove` / `onCreate` are omitted (and the primary
  field declares no `onEdit`) the
  view passes no handler to `TreeList`, so the row's drag source, every Add
  affordance, and inline rename genuinely disappear (no inert placeholders).
- **Alias (reference) nodes** — `hierarchy.getAliasParents` declares extra
  (parent → row) reference edges: the row *also* renders as a leaf under each
  returned parent (skipping parents that aren't rendered rows, the row itself,
  or its real parent). Alias node ids are a projection-internal encoding
  (`<rowKey>\u0000alias\u0000<parentKey>`), so `rowKey` never needs to know;
  `onRowActivate` receives the real row. Aliases are navigation-only: read-only
  label, no row menu / item actions, a trailing link glyph, and `expanded:
  false` (a leaf — the referenced row's own subtree stays at its canonical
  place). Mutations are alias-translated before reaching the consumer: an alias
  can't be dragged (drop no-ops), a `child` drop / add-child on an alias
  resolves to the REAL row, and a drop *beside* an alias degrades to an append
  under the destination parent (an alias has no real sibling position).
- **Alias ranks are minted, not borrowed.** Each alias-parent's aliases get a
  contiguous run of fresh ranks *after* that parent's last real child
  (`Rank.nBetween(maxRealRank, null, k)`), so rank order agrees with display
  order (aliases render last) and no two nodes under one parent share a rank.
  They must not carry the referenced row's own rank: a rank is only meaningful
  within its own sibling group, so importing one from a foreign group collides —
  with per-group ranks (`a0, a1, …`) an alias of any parent's first child lands
  on `a0`, exactly where the host parent's own first child sits. That is not
  cosmetic: `computeDrop` → `computeFlatReorder` rank-SORTS a parent's children
  to find a drop's neighbours, so a duplicate makes `Rank.between(a0, a0)` throw
  → `computeDrop` returns `null` → **the drag is silently swallowed, including
  drops on the REAL rows beside the alias** (the abort happens inside
  `computeDrop`, before the alias-degrading `onMove` wrapper is ever called).
- A consumer using aliases must still be **endpoint-based** (`targetId`/`zone`),
  like every filtered-projection tree. The minted ranks are projection-local:
  an alias occupies rank space that does not exist in storage, so a `dest.rank`
  computed beside one is not a valid key in the real sibling group.

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
<<<<<<< .merge_file_Ri7tVC
  - Uses:
    - `primitives/css/center.Center`
    - `primitives/css/inline.Inline`
    - `primitives/css/ui-kit.cn`
    - `primitives/data-view.DataViewRenderProps`
    - `primitives/data-view.DataViewSlots`
    - `primitives/data-view.evaluateNode`
    - `primitives/data-view.FieldCell`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.HierarchyConfig`
    - `primitives/data-view.ItemActionsDescriptor`
    - `primitives/data-view.makeSortComparator`
    - `primitives/data-view.pickPrimaryField`
    - `primitives/data-view.resolveBodyFields`
    - `primitives/data-view.useResolveCell`
    - `primitives/data-view.useResolveCellEditor`
    - `primitives/data-view.useResolveOperatorSet`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/tree.RowChrome`
    - `primitives/tree.RowChromeMenuHelpers`
    - `primitives/tree.RowMenuItem`
    - `primitives/tree.TreeItem`
    - `primitives/tree.TreeList`
    - `primitives/tree.useTreeListContext`
    - `primitives/tree.useTreeRow`
  - Exports (types):
    - `TreeRowNode`
    - `TreeViewOptions`
=======
  - Uses: `primitives/collapsible.ExpandAllButton`, `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/spacing.Stack`, `primitives/css/sticky.Sticky`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/data-view.DataViewRenderProps`, `primitives/data-view.DataViewSlots`, `primitives/data-view.evaluateNode`, `primitives/data-view.FieldCell`, `primitives/data-view.FieldDef`, `primitives/data-view.GroupedSections`, `primitives/data-view.HierarchyConfig`, `primitives/data-view.ItemActionsDescriptor`, `primitives/data-view.makeSortComparator`, `primitives/data-view.partitionIntoSections`, `primitives/data-view.pickPrimaryField`, `primitives/data-view.resolveBodyFields`, `primitives/data-view.useResolveCell`, `primitives/data-view.useResolveCellEditor`, `primitives/data-view.useResolveOperatorSet`, `primitives/latest-ref.useLatestRef`, `primitives/tree.RowChrome`, `primitives/tree.RowChromeMenuHelpers`, `primitives/tree.RowMenuItem`, `primitives/tree.TreeItem`, `primitives/tree.TreeList`, `primitives/tree.useTreeListContext`, `primitives/tree.useTreeRow`
  - Exports: Types: `TreeRowNode`, `TreeViewOptions`
>>>>>>> .merge_file_dDrE94

<!-- AUTOGENERATED:END -->
