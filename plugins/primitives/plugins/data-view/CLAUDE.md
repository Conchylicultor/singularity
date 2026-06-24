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
  view-*type* (the renderer: `type`, `title`, `icon`, `component`, optional
  `configSchema`). The host actually renders **view-instances** — a named,
  individually-configured *use* of a view-type, carrying `{ id, name, type, options }`.
  The instance list is **config-authored** (N named instances per type,
  Notion-style — see "Config is the single source of truth" below); there is **no
  code-synthesized default mode**. The public `views={[…]}` whitelist is still a
  list of **type** ids (it gates the addable-types `+` menu); instances reference
  a type via their `type` field.
- `<DataView>` is the host: it resolves available views, builds a unified
  `ViewModel` (active id, per-instance state, instance actions), owns the shared
  chrome (search input → `state.query`, view switcher), and renders the active
  view via `renderIsolated`. It passes **raw rows** — each view applies the
  processing matching its own semantics. Flat views call the exported `useFlatRows`
  hook (search → filter → sort); the tree view applies the shared `evaluateNode`
  filter (subtree-preserving, mirroring search) then feeds the result to the tree
  primitive's subtree-preserving search + rank ordering — so filter/search/sort
  behave identically across every view.

## Config mode is universal (no default mode)

Every `<DataView>` is config-backed — there is **no per-mount mode branch**. A
consumer declares its surface id with `defineDataView("<id>")` (branded
`DataViewId`, the type of `DataViewProps.storageKey`), and the data-view
primitive's own barrels register **one `viewsDescriptor` per id** centrally —
`ConfigV2.WebRegister` (web) + `ConfigV2.Register` (server) — with **zero
per-consumer registration boilerplate**. Each descriptor registers under the
**defining (consuming) plugin's tree**: the codegen manifest carries
`{ id, pluginId }` per DataView (the `pluginId` is the node whose `web/**` owns
the `defineDataView` marker), and the registration passes that `pluginId` to
`ConfigV2.{WebRegister,Register}` so config_v2 derives the path
`config/<asPath(pluginId)>/<id>.jsonc` (e.g.
`config/apps/sonata/library/sonata.library.jsonc`). This mirrors `reorder`
exactly: build-time codegen scrapes the markers, the primitive registers the
descriptors under each defining plugin.

### Config is the single source of truth (fail by default)

There is **no code synthesis** of default view-instances. The displayed
instances come **only** from the authored `config.views` rows — when config has
zero rows the runtime returns an empty instance list and `<DataView>` renders a
`Placeholder` ("No views configured — author `config/<plugin>/<id>.jsonc`")
instead of crashing. The build-time **`data-view:configs-authored` check**
(`plugins/primitives/plugins/data-view/check/index.ts`, the reorder
`configs-authored` twin) **fails by default** until each DataView has a
hand-authored `config/<plugin>/<id>.jsonc` — the forcing function that an agent
compose the views in config rather than relying on a code fallback.

**Terse authored rows.** A config row is authored as just `{ name, view }`; the
resolver (`normalizeRows` in `view-core`'s `use-views-config.ts`) derives `id`
(explicit `id` ?? slug(name) ?? `view-${index}`) and `rank` (explicit ?? a
generated `Rank.between` sequence following array order) on read. The `view` blob
is `{ type, sort?, filter?, …opts }` — `sort` is a `SortRule[]` (an ordered,
multi-level sort; each rule `{ fieldId, direction }`, priority = list order, `[]` =
unsorted) and `filter` is a `FilterGroup` tree; both are host-injected keys read via
`viewFor`/`updateView`. **Legacy single-`sort` is migrated on read** — a persisted
`{ fieldId, direction }` object (the old `SortState` shape, still on disk in
committed configs) coerces to `[obj]`; the file is only re-serialized to the array
shape when the user edits sort (never proactively rewritten). The origin default
stays `{ "views": [] }` with
a stable hash (independent of the registered view-types), so adding a view-type
never invalidates committed configs.

- **`defineDataView("id")` marker** (`core/internal/define-data-view.ts`): asserts
  the id grammar `^[a-zA-Z0-9._-]+$` (bans `:` so the id is a filename-safe
  config name) and brands the string `DataViewId`. The brand is the structural
  guarantee — a consumer cannot pass a raw string, so every id is discoverable.
- **Codegen** (`framework/tooling/codegen/.../data-views-gen.ts`) scans every
  plugin's `web/**` for `defineDataView(...)` calls (via `findMarkerCalls` over a
  comment/regex-masked copy) and emits the sorted `{ id, pluginId }` list to
  `shared/data-views.generated.ts` — `pluginId` being the *defining* plugin (the
  node owning the marker), so the config lands in the consuming plugin's tree. The
  `data-views-in-sync` check fails on drift; `./singularity build` regenerates it.
- **Registration** (`{web,server}/internal/{descriptors,config-registrations}.ts`):
  `dataViewDescriptors = new Map(dataViews.map(v => [v.id, viewsDescriptor(v.id)]))`
  builds the reference-stable descriptors once per runtime; the barrels spread one
  `ConfigV2.{WebRegister,Register}` per id, **each passing the entry's own
  `pluginId`** so the config file lands under `config/<asPath(pluginId)>/`.
  `useViewsConfig` resolves the descriptor via
  `dataViewDescriptors.get(storageKey)` (reference identity vs the registration,
  like `reorderDescriptors.get(slotId)`).

The single model is `useConfigViewModel`: config-authored instances, full
instance actions (add / rename / duplicate / delete / reorder / options
sub-form), the `EditableViewSwitcher`, and per-instance sort/filter written
**back to the config row** (durable, git-promotable). Runtime edits write the
**user-global layer** (`setConfig` with no `scopeId`, mirroring reorder) — an
`app:` scopeId would write a scope key the read path ignores until the scope is
forked, silently dropping edits on reload. The per-id descriptor already scopes
views to one surface; per-app forking stays a Settings-pane concern.

**State split** (`web/internal/use-view-state.ts` → `useEphemeralViewState`,
localStorage-only for device-local state):

| State | Lives in |
|---|---|
| Instance def `{ id, rank, name, view:{ type, sort?, filter?, …opts } }` | `viewsDescriptor` config row (user-global layer) |
| Active instance id | localStorage `${storageKey}:active-view` (per device) |
| Search query, tree expand map | localStorage `${storageKey}:view-state` (per device) |

The per-instance config row is the single durable home for sort/filter, with
active-id / query / expand demoted to device-local. The localStorage reader stays
tolerant of legacy `view-state` blobs that still carry `sort`/`filter` keys (they
are ignored).

**Per-instance options sub-form.** A view-type's optional `configSchema`
(`FieldsRecord`) drives the settings popover's options sub-form: the host builds a
web-side `variantField({ useVariants })` from the live contributions
(`use-view-variants.ts` — generic, never names a view child) and renders it via
`FieldRenderer`. The gallery's `coverField` is the reference `configSchema`.

**Orphan hazard.** A config row whose `view.type` references a renamed/removed
view-type (or a hierarchical type when the source has no hierarchy) **fail-soft
skips** in `buildInstanceFromRow` — the same documented hazard as reorder
node-type ids. The row stays in the config; it just isn't rendered until its
view-type returns.

## Hierarchy

A data source can declare itself hierarchical by passing `hierarchy` (a
`HierarchyConfig<TRow>`) to `<DataView>`. Present → hierarchical views (the
tree) become selectable; absent → the host drops them from the switcher. The
`HierarchyConfig` carries accessors (`getParentId`, `getRank`, `isExpanded`) and
mutations (`onToggleExpanded`, `onMove`, `onCreate`) — all optional
except the two accessors, so a read-only nav tree supplies just those two. The
`FieldDef.primary` flag selects the tree row label field (shared
`pickPrimaryField` heuristic). Inline rename of the primary label is no longer a
hierarchy concern — declare `FieldDef.onEdit` on the primary field and the tree
renders an inline editor (the same `onEdit` contract the table/gallery/list use).

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

### Typed fields are the generic extension point

To make a data-view filterable on a new dimension, **add a typed `FieldDef`** —
do **not** bolt a bespoke toggle chip onto the toolbar. A field whose `type`
resolves a `FilterOperatorSet` (`bool`, `enum`, `number`, `date`, `tags`, `text` —
all already registered) automatically appears in the "Filter" pill; `enum` fields
read their choices from `FieldDef.options`. This is also the generic substrate for
future configurability (saved filters, sort, grouping): they operate on the same
field schema, so a new typed field unlocks all of them at once with zero chrome code.

The **tree** view honors **filter** (subtree-preserving) but **not sort** — it
orders by hierarchy rank, ignoring `ViewState.sort`. It opts out by contributing
`supportsSort: false` (a `DataViewContribution` flag, *not* a generic
`ViewTypeMeta` key — view-core never knows about sort), so the host hides the
Sort pill on the tree view while keeping the Filter pill. Default (flag omitted)
= honors sort.

In the **tree** view only the `primary` field renders, so non-primary fields are
**filter-only**: invisible in the tree body but fully usable in the filter builder
(set `filterable: false` to also keep them out of the full-text search accessor).
The settings config nav is the worked example — its `modified` (bool), `conflict`
(bool), and `source` (enum) fields are pure filter dimensions over a hierarchy that
only ever renders the config name, having replaced an earlier ad-hoc "Modified" chip.

## Placement: always natural-height, never owns a scroll

`<DataView>` has **no placement mode** — it is **always natural-height** and
**never owns a scroller**. The root is a plain block box (`<Stack gap="none">` =
`flex flex-col`, *no* `min-h-0 flex-1`), so the body grows to its natural content
height and the **enclosing pane owns exactly one scroll**, provided by
`<PaneScroll>` (`@plugins/primitives/plugins/pane/web`). The single-scroll model
removes the whole class of nested/severed-scroll bugs — a DataView dropped into a
flex-severed wrapper can no longer balloon to full content height and starve the
scroll.

- **The toolbar is a `<Sticky edge="top">` header.** It pins against the pane's
  scroll viewport, staying visible whether the DataView is the pane's sole
  content or one of several stacked sections. The `<Stack gap="none">` root is
  each DataView's own sticky **containing block**, so stacked DataViews hand off
  automatically — when a section scrolls out its toolbar un-pins with it, no
  `active` toggling or computed `top` offsets. The toolbar carries
  `bg-background` so rows never show through the pinned bar.
- **The pane provides the scroll.** A pane body is one `<PaneScroll>` viewport;
  every header within it (the DataView toolbar, a section's stats header) is a
  `<Sticky>`. `PaneChrome` routes its body through `<PaneScroll>` for free, so a
  DataView rendered as `PaneChrome` children scrolls for free; a non-pane host
  must supply its own `<PaneScroll>` (or equivalent `overflow-y` scroller) around
  the DataView.

**Dev-mode structural guard.** On mount `<DataView>` walks up from its root for a
scroll ancestor (`overflow-y ∈ {auto, scroll, overlay}`) before reaching the
document scroller; if none is found it `console.error`s
`[DataView <storageKey>] no scroll ancestor — the pane must provide a <PaneScroll>`.
This catches a pane that forgot its `<PaneScroll>` loudly (dev only,
non-fatal — `console.error`, never throw, to stay safe for overlay/SSR edges).

The toolbar, filter bar, and view switcher always render — there is no
headless-chrome axis.

## Row virtualization (`VirtualRows`)

Large views window their rows through the shared `<VirtualRows>` component, which
now lives in its **own leaf primitive** (`primitives/virtual-rows`,
`@plugins/primitives/plugins/virtual-rows/web`) — not the data-view barrel — so
both `data-view/list` and the `primitives/tree` primitive (which `data-view/tree`
builds on) can consume it without a layering inversion. It wraps
`@tanstack/react-virtual` with dynamic row measurement (variable heights
supported) behind a small API: `items`, `estimateSize`, `getKey`,
`itemClassName?`, `overscan?`, `scrollToIndex?` (scrolls to an index with
`align: "auto"` — for host-driven selection reveal), plus a
`children(item, index)` row renderer.

**It self-discovers the scroll container** — `findScrollParent` walks up to the
nearest ancestor whose `overflow-y` is `auto`/`scroll`/`overlay` (fallback: the
document scroller), then measures `scrollMargin` (the list's offset within that
scroller) so windowing is correct even when a sticky toolbar / tab strip sits
above the list. This is deliberately *not* a threaded-in ref: since the DataView
never owns its own scroll, windowing binds to the pane's single `<PaneScroll>`
(or any outer scroller the host provides), and the sticky toolbar's height is
folded into the measured `scrollMargin` automatically.

The **list** and **tree** views virtualize today; the tree windows inside the
`primitives/tree` `TreeList` once a
DFS-flattened list exceeds **100 *visible* (expanded) rows** (below that the
recursive render runs byte-for-byte unchanged), reusing the same shared primitive
via `scrollToIndex` for selection reveal. **table** and **gallery** are the
remaining follow-ups (see `research/2026-06-18-data-view-row-virtualization.md`
and `research/2026-06-18-tree-view-virtualization.md`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter. Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.
- Web:
  - Slots: `DataViewSlots.View` ← `primitives.data-view.gallery`, `primitives.data-view.list`, `primitives.data-view.table`, `primitives.data-view.tree`, `DataViewSlots.Cell` ← `fields.bool.table`, `fields.color.table`, `fields.date.table`, `fields.enum.table`, `fields.image.table`, `fields.number.table`, `fields.tags.table`, `fields.text.table`, `DataViewSlots.CellEditor` ← `fields.bool.inline`, `fields.date.inline`, `fields.enum.inline`, `fields.number.inline`, `fields.tags.inline`, `fields.text.inline`, `DataViewSlots.Filter` ← `fields.bool.filter`, `fields.date.filter`, `fields.enum.filter`, `fields.number.filter`, `fields.tags.filter`, `fields.text.filter`
  - Contributes: `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`, `ConfigV2.WebRegister`
  - Uses: `config_v2.useConfig`, `config_v2.useSetConfig`, `primitives/css/center.Center`, `primitives/css/inline.Inline`, `primitives/css/placeholder.Placeholder`, `primitives/css/row.Row`, `primitives/css/scroll.Scroll`, `primitives/css/spacing.Inset`, `primitives/css/spacing.Stack`, `primitives/css/sticky.Sticky`, `primitives/css/surface.Surface`, `primitives/css/text.SectionLabel`, `primitives/css/text.Text`, `primitives/css/toggle-chip.ToggleChip`, `primitives/css/ui-kit.Button`, `primitives/css/ui-kit.cn`, `primitives/css/ui-kit.ControlSizeProvider`, `primitives/css/ui-kit.DropdownMenu`, `primitives/css/ui-kit.DropdownMenuContent`, `primitives/css/ui-kit.DropdownMenuItem`, `primitives/css/ui-kit.DropdownMenuSeparator`, `primitives/css/ui-kit.DropdownMenuTrigger`, `primitives/css/ui-kit.Input`, `primitives/css/ui-kit.SingleLineProvider`, `primitives/data-view/view-core.buildViewConfigContributions`, `primitives/data-view/view-core.buildViewDescriptors`, `primitives/data-view/view-core.EditableViewSwitcher`, `primitives/data-view/view-core.useViewModel`, `primitives/data-view/view-core.useViewVariants`, `primitives/hover-reveal.hoverRevealClass`, `primitives/hover-reveal.useHoverReveal`, `primitives/icon-button.IconButton`, `primitives/latest-ref.useLatestRef`, `primitives/popover.InlinePopover`, `primitives/search.SearchInput`, `primitives/search.useTextFilter`, `primitives/slot-render.defineDispatchSlot`, `primitives/slot-render.defineRenderSlot`, `primitives/slot-render.renderIsolated`, `primitives/slot-render.RenderSlot`, `primitives/sortable-list.SortableItem`, `primitives/sortable-list.SortableList`, `primitives/tooltip.WithTooltip`
  - Exports: Types: `CellEditorProps`, `CreateOption`, `DataViewContribution`, `DataViewId`, `DataViewProps`, `DataViewRenderProps`, `FieldCellProps`, `FieldDef`, `FieldValue`, `FilterConjunction`, `FilterController`, `FilterFieldValue`, `FilterGroup`, `FilterNode`, `FilterOperator`, `FilterOperatorSet`, `FilterRule`, `FilterValueInputProps`, `HierarchyConfig`, `ItemActionContribution`, `ItemActionProps`, `ItemActions`, `ItemActionsDescriptor`, `SelectionConfig`, `SortController`, `SortPreset`, `SortRule`, `TableCellProps`, `ViewState`; Values: `applyFilter`, `ChipSelectFilterInput`, `DataView`, `DataViewSlots`, `defineDataView`, `defineItemActions`, `EditableCell`, `evaluateNode`, `FieldCell`, `FilterValueInput`, `isFilterGroup`, `pickPrimaryField`, `useFilterController`, `useFlatRows`, `useResolveCell`, `useResolveCellEditor`, `useResolveOperatorSet`, `useSortController`
- Server:
  - Uses: `primitives/data-view/view-core.buildViewConfigRegistrations`
- Cross-plugin:
  - Imported by: `apps/deploy/servers`, `apps/home/app-cards`, `apps/pages/page-tree`, `apps/prototypes/gallery`, `apps/sonata/library`, `apps/story/shell`, `apps/studio/explorer`, `code-explorer`, `config_v2/settings`, `conversations/agents`, `debug/profiling/runtime`, `debug/reports`, `debug/slow-ops/cluster`, `debug/slow-ops/pane`, `fields/bool/filter`, `fields/bool/inline`, `fields/bool/table`, `fields/color/table`, `fields/date/filter`, `fields/date/inline`, `fields/date/table`, `fields/enum/filter`, `fields/enum/inline`, `fields/enum/table`, `fields/image/table`, `fields/number/filter`, `fields/number/inline`, `fields/number/table`, `fields/tags/filter`, `fields/tags/inline`, `fields/tags/table`, `fields/text/filter`, `fields/text/inline`, `fields/text/table`, `primitives/data-view/gallery`, `primitives/data-view/list`, `primitives/data-view/table`, `primitives/data-view/tree`, `tasks/task-list`, `tasks/task-list/recent`, `tasks/task-list/tree`, `ui/tweakcn/community-browser`
- Core:
  - Exports: Types: `CellEditorProps`, `CreateOption`, `DataViewId`, `DataViewProps`, `DataViewRenderProps`, `FieldDef`, `FieldValue`, `FilterConjunction`, `FilterFieldValue`, `FilterGroup`, `FilterNode`, `FilterOperator`, `FilterOperatorSet`, `FilterRule`, `FilterValueInputProps`, `HierarchyConfig`, `ItemActionProps`, `ItemActionsDescriptor`, `SelectionConfig`, `SortPreset`, `SortRule`, `TableCellProps`, `ViewState`; Values: `defineDataView`
- Sub-plugins:
  - **`gallery`** — Gallery view child for the data-view primitive: a responsive card grid with a field-driven default card plus a composable DataCard chrome.
  - **`list`** — List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.
  - **`table`** — Table view for data-view: maps the typed field schema to data-table columns with host-controlled sort.
  - **`tree`** — Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).
  - **`view-core`** — Type-agnostic named-view-instance engine: instance model + resolver, config-descriptor machinery, debounced write-back, and the editable view-switcher chrome. Type-agnostic named-view-instance engine (server): the per-id `views` config descriptor + a generic registration helper. Consumers register their own ids under their own plugin.

<!-- AUTOGENERATED:END -->
