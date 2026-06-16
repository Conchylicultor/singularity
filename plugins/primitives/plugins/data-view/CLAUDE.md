# data-view

A Notion-like multi-view data surface. One **data source** — `rows` plus a typed
`FieldDef[]` schema — rendered through multiple **views** (gallery, table, …), each
view independently sorted / searched / filtered.

## Architecture

- A single **global `DataViewSlots.View` slot** (a plain `defineSlot`, rendered via
  `renderIsolated`). Each view type is a child plugin that contributes one
  `DataViewContribution` keyed by its **`type`** id (`"table"`, `"gallery"`, …).
  This mirrors the `segmented-progress-bar` precedent (one
  global `Variant` slot, children contribute variants) — the inverse of the
  `defineTabbedView` factory, which exists because each tab host has a *different* set
  of tabs. Our views are a *fixed shared vocabulary*.
- **view-type vs view-instance.** A `DataViewContribution` is a registered
  view-*type* (the renderer: `type`, `title`, `icon`, `component`). The host
  actually renders **view-instances** — a named, individually-configured *use* of
  a view-type, carrying `{ id, name, type, options }`. Today the
  `useResolvedInstances` resolver synthesizes exactly **one default instance per
  resolved view-type** (`id === type`, `name === title`), so behavior is identical
  to "one instance per type". ST3+ will replace that synthesis with a
  config-authored instance list (N named instances per type, Notion-style). The
  public `views={[…]}` whitelist is still a list of **type** ids; instances
  reference a type via their `type` field.
- `<DataView>` is the host: it resolves available views, owns per-view state
  (`useViewState`) and the shared chrome (search input → `state.query`, view
  switcher), and renders the active view via `renderIsolated`. It passes **raw
  rows** — each view applies the processing matching its own semantics. Flat
  views call the exported `useFlatRows` hook (search → filter → sort); the tree
  view applies the shared `evaluateNode` filter (subtree-preserving, mirroring
  search) then feeds the result to the tree primitive's subtree-preserving search
  + rank ordering — so filter/search/sort behave identically across every view.

## Hierarchy

A data source can declare itself hierarchical by passing `hierarchy` (a
`HierarchyConfig<TRow>`) to `<DataView>`. Present → hierarchical views (the
tree) become selectable; absent → the host drops them from the switcher. The
`HierarchyConfig` carries accessors (`getParentId`, `getRank`, `isExpanded`) and
mutations (`onToggleExpanded`, `onMove`, `onRename`, `onCreate`) — all optional
except the two accessors, so a read-only nav tree supplies just those two. The
`FieldDef.primary` flag selects the tree row label field (shared
`pickPrimaryField` heuristic).

## Create affordances (`creators`)

Pass `creators?: CreateOption[]` to `<DataView>` to declare typed "make a new
row" actions — the first-class create affordance for flat views (gallery/table/
list), the counterpart to the tree-only parent-scoped `HierarchyConfig.onCreate`.
A `CreateOption` is domain-pure: `{ id, label, icon?, description?, onSelect }`
(`onSelect` may be async). `CreateOption` is exported from both the core and web
barrels.

The host renders them in the toolbar (a private `CreatorsControl`, **not**
barrel-exported), immediately before the view switcher:

- **0** creators → nothing.
- **1** → a labelled `Button`.
- **N** → a `+` `IconButton` opening a dropdown menu of icon + label (+ muted
  `description` sub-line) items.

`CreatorsControl` owns a single shared **busy** flag: each click `await`s
`onSelect` in a `try/finally`, disabling the control while pending — one
consistent in-flight affordance for every consumer (no per-call-site `useState`).
The creators are also threaded into `DataViewRenderProps.creators` so views can
opt into their own surface-specific create UI (the gallery's trailing "+" card +
empty-state CTA — see the gallery child).

## Per-item actions

Per-row actions (delete, expand-all, …) are a **cross-view** concern: contribute
an action once, every view renders it in its natural trailing affordance (tree-row
hover-trailing, table-row hover-trailing column, gallery-card top-right hover).

The mechanism is the **`defineItemActions<TRow>(id)` factory** (web barrel),
mirroring the `detail-sections` / `tabbed-view` factory precedent — **not** a
global slot like `View`. `View` is global because views are a *fixed shared
vocabulary* with one render-props contract; item actions are the factory case
because each consumer's row type is disjoint (`Block`, `TaskListItem`, `Agent`)
and its contributor set differs. A global slot would force
`ComponentType<ItemActionProps<unknown>>` and a runtime `kind` discriminator to
keep one app's Delete off another app's rows; per-consumer slots are isolated by
construction and keep full `TRow` typing.

Each consumer calls `defineItemActions<Row>("<stable-id>")` once. The result is
**callable for contributions** (`MyActions({ id, component })`, like any
`defineRenderSlot`) and carries `.Row` — the `ItemActionsDescriptor`. Pass it to
`<DataView itemActions={MyActions} />`; the host threads it (plus a derived
`hasChildren` predicate from `hierarchy.getParentId`) into every view, which
renders `<itemActions.Row row={…} hasChildren={…} />` in its own affordance. Each
action component receives `ItemActionProps<Row>` (`{ row, hasChildren }`).

## Collection-consumer separation

Consumers import **only** `DataView` + the core types from this umbrella and select
views by **type** id (`views={["gallery", "table"]}` — these are
`DataViewContribution.type` ids, not instance ids). They **never** import a view
child (`data-view/plugins/gallery`, …). Adding a new view type is a new child
plugin with zero consumer changes — exactly the segmented-progress-bar collection
model.

## Adding a new view child

1. Create `plugins/primitives/plugins/data-view/plugins/<view>/`.
2. In its `web/index.ts`, contribute one entry to the slot:
   `DataViewSlots.View({ type: "<view>", title, icon, order?, hierarchical?, component })`.
   The `type` is the view-type's registry id (what consumers list in
   `views={[…]}`); the host synthesizes a default instance with `id === type`.
   The `component` is a `ComponentType<DataViewRenderProps<unknown>>` — it receives the
   **raw** `rows`, the `fields`, `rowKey`, the view's `ViewState`, `setSort` /
   `setFilter` bound to this view, `onRowActivate`, `searchAccessor`, `hierarchy`
   (present only for hierarchical sources), the opaque `options`
   (= `viewOptions[viewId]`, cast internally to the view's own typed options), and
   `emptyState`. The view applies its own row processing (flat views call
   `useFlatRows`). Re-cast `rows`/`fields`/`options`/`hierarchy` from `unknown` to
   `TRow` at the component boundary (the documented cast site).
3. Run `./singularity build` — the plugin registry (`web.generated.ts`) is autogenerated
   from the filesystem, so the new `web/index.ts` is discovered automatically (no manual
   registration). Done — every existing `<DataView>` consumer can now opt in by id.

## Filtering

Per-field filtering is driven by `FieldDef.type`: the host's `FilterBuilderTrigger`
writes a `FilterGroup` tree to `state.filter`, and every view evaluates it through
the shared `evaluateNode` / `applyFilter` evaluator (resolved per field type via
`useResolveOperatorSet`). Flat views apply it inside `useFlatRows` (search → filter
→ sort); the tree view applies it subtree-preserving before handing rows to the tree
primitive. Filter semantics are therefore identical across all views.

## Placement mode

`<DataView>` accepts a `mode?: "surface" | "embedded"` axis controlling how it
claims vertical space:

- **`"surface"`** (default): the full-surface layout. The root is
  `flex min-h-0 flex-1 flex-col` and the body wrapper is
  `min-h-0 flex-1 overflow-y-auto`, so the view fills a **bounded-height** flex
  ancestor and owns its own internal scroll. The toolbar also reserves the
  `pr-14` floating-action-bar gutter. Use when `<DataView>` is the pane's main
  content.
- **`"embedded"`**: auto-height. The root drops `min-h-0 flex-1` and the body
  wrapper drops `min-h-0 flex-1 overflow-y-auto`, so content grows to its
  **natural height** and the **host pane** scrolls — never the view. The
  floating-action-bar gutter is dropped too. Use when `<DataView>` is stacked
  among siblings inside a vertically-scrolling page (a section in a detail pane).
  Dropping a `"surface"` DataView into an auto-height context collapses its body
  to ~0px, which is why this mode exists.

The toolbar, filter bar, and view switcher render in **both** modes — `mode` is
the placement/height axis only, not a headless-chrome axis.

**View contract.** The host threads the derived `embedded` boolean into every
view via `DataViewRenderProps.embedded`. Views must **gate their own
full-surface outer padding / forced heights on `!props.embedded`** so an embedded
host doesn't paint surface-sized whitespace or `h-full` blocks that collapse.
Today only the gallery view needs this (grid `p-xl` and the empty-state
`h-full` are gated); table and tree views have no full-surface padding to drop
and are mode-agnostic. New view children should follow the same `!props.embedded`
gating convention.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter. Registers the data-view saved view-state config_v2 descriptor (per-surface active view, sort, and filter).
- Web:
  - Slots: `DataViewSlots.View` ← `primitives.data-view.gallery`, `primitives.data-view.list`, `primitives.data-view.table`, `primitives.data-view.tree`, `DataViewSlots.Cell` ← `fields.bool.table`, `fields.color.table`, `fields.date.table`, `fields.enum.table`, `fields.image.table`, `fields.number.table`, `fields.tags.table`, `fields.text.table`, `DataViewSlots.CellEditor` ← `fields.bool.inline`, `fields.date.inline`, `fields.enum.inline`, `fields.number.inline`, `fields.tags.inline`, `fields.text.inline`, `DataViewSlots.Filter` ← `fields.bool.filter`, `fields.date.filter`, `fields.enum.filter`, `fields.number.filter`, `fields.tags.filter`, `fields.text.filter`
  - Contributes: `ConfigV2.WebRegister`
  - Uses: `config_v2.ConfigV2`, `config_v2.useConfig`, `config_v2.useSetConfig`, `primitives/icon-button.IconButton`, `primitives/popover.InlinePopover`, `primitives/row.Row`, `primitives/search.SearchInput`, `primitives/search.useTextFilter`, `primitives/slot-render.defineDispatchSlot`, `primitives/slot-render.defineRenderSlot`, `primitives/slot-render.renderIsolated`, `primitives/slot-render.RenderSlot`, `primitives/spacing.Inset`, `primitives/spacing.Stack`, `primitives/surface.Surface`, `primitives/text.Text`, `primitives/ui-kit.Button`, `primitives/ui-kit.cn`, `primitives/ui-kit.DropdownMenu`, `primitives/ui-kit.DropdownMenuContent`, `primitives/ui-kit.DropdownMenuItem`, `primitives/ui-kit.DropdownMenuSeparator`, `primitives/ui-kit.DropdownMenuTrigger`, `primitives/ui-kit.Input`, `primitives/view-switcher.ViewSwitcher`
  - Exports: Types: `CellEditorProps`, `CreateOption`, `DataViewContribution`, `DataViewProps`, `DataViewRenderProps`, `FieldDef`, `FieldValue`, `FilterConjunction`, `FilterController`, `FilterFieldValue`, `FilterGroup`, `FilterNode`, `FilterOperator`, `FilterOperatorSet`, `FilterRule`, `FilterValueInputProps`, `HierarchyConfig`, `ItemActionContribution`, `ItemActionProps`, `ItemActions`, `ItemActionsDescriptor`, `SelectionConfig`, `SortState`, `TableCellProps`, `ViewInstance`, `ViewState`; Values: `applyFilter`, `DataView`, `DataViewSlots`, `defineItemActions`, `evaluateNode`, `FilterValueInput`, `isFilterGroup`, `pickPrimaryField`, `useFilterController`, `useFlatRows`, `useResolveCell`, `useResolveCellEditor`, `useResolveOperatorSet`
- Server:
  - Uses: `config_v2.ConfigV2`
- Cross-plugin:
  - Imported by: `apps/deploy/servers`, `apps/home/app-cards`, `apps/pages/page-tree`, `apps/sonata/library`, `apps/story/shell`, `config_v2/settings`, `conversations/agents`, `fields/bool/filter`, `fields/bool/inline`, `fields/bool/table`, `fields/color/table`, `fields/date/filter`, `fields/date/inline`, `fields/date/table`, `fields/enum/filter`, `fields/enum/inline`, `fields/enum/table`, `fields/image/table`, `fields/number/filter`, `fields/number/inline`, `fields/number/table`, `fields/tags/filter`, `fields/tags/inline`, `fields/tags/table`, `fields/text/filter`, `fields/text/inline`, `fields/text/table`, `primitives/data-view/gallery`, `primitives/data-view/list`, `primitives/data-view/table`, `primitives/data-view/tree`, `tasks/task-list`, `tasks/task-list/tree`, `ui/tweakcn/community-browser`
- Core:
  - Exports: Types: `CellEditorProps`, `CreateOption`, `DataViewProps`, `DataViewRenderProps`, `FieldDef`, `FieldValue`, `FilterConjunction`, `FilterFieldValue`, `FilterGroup`, `FilterNode`, `FilterOperator`, `FilterOperatorSet`, `FilterRule`, `FilterValueInputProps`, `HierarchyConfig`, `ItemActionProps`, `ItemActionsDescriptor`, `SelectionConfig`, `SortState`, `TableCellProps`, `ViewInstance`, `ViewState`
- Sub-plugins:
  - **`gallery`** — Gallery view child for the data-view primitive: a responsive card grid with a field-driven default card plus a composable DataCard chrome.
  - **`list`** — List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.
  - **`table`** — Table view for data-view: maps the typed field schema to data-table columns with host-controlled sort.
  - **`tree`** — Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).

<!-- AUTOGENERATED:END -->
