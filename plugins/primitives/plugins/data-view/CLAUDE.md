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

### Adoption is enforced (`no-adhoc-row-list`)

The complementary forcing function: the `data-view/no-adhoc-row-list` lint rule
(`lint/no-adhoc-row-list.ts`, enforced as `error` repo-wide) bans hand-rolling
a data list as a `.map()` of `<Row>` in feature code. A collection of
homogeneous domain records must be a `<DataView>`; genuine transient chrome
(menus, pickers, tab strips, typeaheads) keeps `Row` with
`// eslint-disable-next-line data-view/no-adhoc-row-list -- <reason>`. The
row-rendering machinery itself (this plugin's view children, `primitives/tree`,
`reorder/editor`) is permanently exempt via the rule's `ignores`. So the two
checks bracket the choice: `no-adhoc-row-list` fires when you avoid DataView,
`configs-authored` fires until you finish adopting it.

**Terse authored rows.** A config row is authored as just `{ name, view }`; the
resolver (`normalizeRows` in `view-core`'s `use-views-config.ts`) derives `id`
(explicit `id` ?? slug(name) ?? `view-${index}`) on read. **Array position is the
canonical order** — there is no `rank` field. The `view` blob
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
| Instance def `{ id, name, view:{ type, sort?, filter?, …opts } }` (array-ordered) | `viewsDescriptor` config row (user-global layer) |
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

## Multi-source surfaces (`MergedDataView`)

One surface, N **sources**, one unified switcher: `<MergedDataView storageKey
sources hostProps title? actions? defaultView?>` renders a single DataView
surface (**one `storageKey` → one config file → one `EditableViewSwitcher`**)
whose view-instances each bind to a source via the config row's optional
`source` key (`{ "id": "queue", "name": "Queue", "source": "queue", "view":
{ "type": "list" } }`). The sort/filter/search/properties chrome adapts
automatically because it already derives from the active instance's fields —
the source axis only decides *which data bundle* feeds the body.

- **Sources are contributed components** through the per-consumer
  `defineDataViewSources<THostProps>(id)` factory (web barrel — the sibling of
  `defineItemActions`/`defineFieldExtensions`). A contribution is `{ id, title,
  icon, order?, views?, hasHierarchy?, component }`; the component receives
  `DataViewSourceProps<THostProps>` = `{ hostProps, render }`, owns its data
  hooks, and **must always call `render(bundle)`** (pass `{ rows: [], loading:
  true, … }` while loading — never early-return `null`, or the surface chrome
  vanishes). The bundle is `DataViewSourceBundle<TRow>` = `DataViewProps` minus
  the shell-owned keys (`storageKey`/`title`/`actions`/`defaultView`/`views`).
- **`views` / `hasHierarchy` are STATIC contribution metadata**, not bundle
  keys, on purpose: the view model must resolve *every* config row (switcher
  chips, add-menu gating, the hierarchical gate) before any source component
  mounts — and only the ACTIVE source ever mounts. Everything dynamic (rows,
  fields, the actual `hierarchy` accessors, `viewOptions`, `dataSource`, …)
  stays in the bundle; the host dev-warns when a bundle's `hierarchy` presence
  contradicts the declared `hasHierarchy`. Code-only `viewOptions`
  (`renderRow`, `renderCard`, …) reach the view through the body's options
  re-merge (`{ ...bundle.viewOptions[type], ...instance.options }` — idempotent
  on the single-source path).
- **Only the active source mounts** (plain `renderIsolated`, no recursive
  fold); switching sources remounts the body (`key={source.id}`), so
  per-source subscriptions/controllers restart cleanly, and the server-page
  cache is scoped per source (`sourceScope`).
- **Fail-soft on unknown sources.** A row whose `source` matches no live
  contribution (renamed/removed source id) is kept in config and skipped —
  the same hazard class as an orphan `view.type`.
- **Instance ids must be unique ACROSS sources** (one config file = one id
  namespace). `normalizeRows` would disambiguate a duplicate with an index
  suffix, silently renaming the row and orphaning its durable
  `data_view_row_order` rows — author distinct ids per row, as
  `config-stable-list-ids` already forces.
- **Presets stay per-surface and fail-soft by design.** Sort/filter presets
  key off `storageKey` only, so they are shared across sources; a preset
  referencing a field the active source's schema lacks is simply excluded by
  the controllers' dangling-fieldId guards. Do not namespace them per source.
- Single-source `<DataView>` is the same machinery with **one implicit source
  entry** (`id`/`title` undefined): same model, flat add menu, `source`-less
  config rows — byte-identical to the pre-source behavior. The engine-side
  semantics (row model, `ViewSourceEntry`, whitelist-gates-addability) live in
  view-core — see its CLAUDE.md.

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

Beyond the single-parent tree, `getAliasParents` declares optional **reference
edges**: the row *also* appears as a read-only leaf ("alias") under each
returned parent id (e.g. the pages sidebar rendering linked pages as children
of the linking page). Aliases are pure references — navigation only, no
rename/menu/actions/drag; a `child` drop or add-child on one resolves to the
real row. See the tree view child's CLAUDE.md for the exact semantics.

## Manual order

Flat rank-based drag reordering — the flat twin of the tree-only
`HierarchyConfig`. It is described by one type:

```ts
interface ManualOrderConfig<TRow> {
  getRank: (row: TRow) => Rank | null;
  onMove: (id: string, dest: {
    rank: Rank; groupKey?: string | null; targetId?: string; zone?: "before" | "after";
  }) => void | Promise<void>;
}
```

### Two sources, one rule

A `ManualOrderConfig` reaches the active view from exactly one of two places:

1. **`DataViewProps.manualOrder`** — a **domain** order the consumer owns (a rank
   column on its own rows, e.g. the conversations queue's priority). Surface-wide:
   every view instance shares it.
2. **The primitive's own per-view-instance order**, contributed through the global
   **`DataViewSlots.RowOrder`** slot (see below). Scoped to `(storageKey, viewId)`,
   so two instances of the same surface hold **different** orders.

**The consumer's wins when both are present.** The host resolves
`cfg = props.manualOrder ?? contributedRowOrder ?? null` once and never branches on
provenance again — the render path treats the two identically.

### Manual order is the default; a sort overrides it

Notion's model, and ours:

- With **no sort set**, a `list`/`table` view renders in manual order and rows are
  draggable.
- Setting a **field sort overrides** the manual order and suspends drag (the host
  simply withholds the config; `useDataViewSections`'s `manualRank ⇒ sort: []` rule
  is untouched).
- **Clearing the sort restores** the manual order.

Consequently the **Sort pill is no longer hidden** in manual mode — it must stay
reachable to clear the sort. (It used to be, back when `manualOrder` and sort were
mutually exclusive modes.)

When a config is active for the displayed view:

- the section pipeline **skips the field sort** and orders each section's entries
  by `getRank` (search/filter still run) — like the tree ignores `ViewState.sort`;
- rows render with rank-reorder drag affordances via the **`rank-reorder`**
  primitive (`RankReorderProvider` + `useRankReorderItem`), the same DnD machinery
  the tree's sibling zones use — one reorder model, not two;
- reordering is **within a section**; a cross-section drag reports the destination
  section via `onMove`'s `dest.groupKey` (the consumer maps the new group to its
  own field mutation — the primitive carries no field/status knowledge);
- `list` and `table` **window *and* drag**. `rank-reorder`'s shell re-measures
  droppables every frame (`measuringAlways`), and `virtual-rows` pins the drag
  source through `keepMounted`, so an in-flight drag survives its source row
  scrolling out — the composition `primitives/tree` already used.

The table integration uses `DataTable`'s additive `useRowDecoration` per-row hook
seam (drag source ref + props + in-row drop indicators), composed with the
windowing measure ref.

### The global `RowOrder` slot (cross-plugin)

The sibling of the global `FieldExtension` slot: a single always-on
`defineRenderSlot` (`primitives.data-view.row-order`) whose contributors may claim
a per-view-instance row order for **any** DataView, with the host importing
nothing. Its props erase the row type (a global slot spans disjoint consumer row
types) and carry the surface coordinates a contributor needs:

```ts
interface GlobalRowOrderProps {
  storageKey: DataViewId;
  viewId: string;                  // the ACTIVE view-instance id — the order's scope
  rowKey: (row: unknown, index: number) => string;
  rows: readonly unknown[];        // the ordered set (below)
  render: (order: ManualOrderConfig<unknown> | null) => ReactNode;
}
```

The host folds it in `CollectRowOrder` (`web/internal/row-order.tsx`), a recursive
**component** fold mirroring `CollectFieldExtensions` — never a `.map` over
contributed hooks, which `react-hooks/rules-of-hooks` rejects. Each contributor
mounts error-boundary-isolated (`renderIsolated`), runs its own hooks, and hands
back a config (or `null` to abstain) through `render`. **First non-null wins**;
because the slot is a `defineRenderSlot`, that precedence is a committed reorder
override (`config/primitives/data-view/primitives.data-view.row-order.jsonc`), not
an import-order accident. `render` recurses to the next contributor, and the base
case emits the resolved order into the host's children-callback — which is a plain
function call, not a component, so it contains no hooks.

**`rows` is the view's ordered set: filter-applied, search-EXCLUDED,
sort-suppressed.** The host computes it with
`useFlatRows(effectiveRows, fields, { ...activeState, sort: [], query: "" }, …)`.
Rows the view filters out never receive a rank. Search only changes what is
*rendered*, never which rows the order covers — so a drag under an active search
still resolves against the full ordered set (the moved row lands adjacent to its
target globally, no hidden row is dropped), even though the contributor persists
only a bounded write set for the gesture, not the whole order (see view-order's
CLAUDE.md).

### The `rowOrderEnabled` gate

`CollectRowOrder` takes an `enabled` prop and short-circuits **before**
`useContributions()` when false — so an ineligible DataView never mounts a
contributor and never subscribes to its live resource. Each clause is a structural
exclusion, not a preference:

```ts
const rowOrderEnabled =
  activeSupportsManualOrder &&   // list / table only — gallery/tree have no flat rank axis
  manualOrder == null &&         // a consumer's domain order wins
  props.dataSource == null &&    // server-paginated ⇒ the client cannot own the order
  aggregate == null &&           // an aggregate representative's rank cannot stand for its members
  !activeState.groupBy;          // a cross-group drop would need a field write the primitive cannot do
```

**The sort test is deliberately absent here.** It lives in `manualOrderActive`
(`cfg != null && activeSupportsManualOrder && activeState.sort.length === 0`)
instead, so toggling a sort off and on does not tear down the contributor's live
subscription — the host merely withholds the config while a sort is set.

## Grouped sections: one pipeline, one chrome

`useDataViewSections` computes the sections; **`<GroupedSections>`** (web barrel)
presents them. They are deliberate siblings: a view child's grouped branch renders
*through* the chrome rather than hand-rolling it.

```tsx
sections.length === 1 && sections[0]!.key === null ? (
  renderBody(sections[0]!.entries)          // ungrouped: headerless fast-path
) : (
  <GroupedSections
    sections={sections}
    collapsedSections={props.collapsedSections}
    setSectionCollapsed={props.setSectionCollapsed}
  >
    {(section) => renderBody(section.entries)}
  </GroupedSections>
)
```

It owns the whole group-header policy: the shared `<Stack gap="none">` sticky
containing block, the `<StickyStack>` pinned at the host-published
`--dv-header-offset`, the DOM-less `<CollapsibleProvider>` per section, and the
`SectionHeaderRow` (label + count). So group headers **pin, and stack up to 5
groups, degrading to the swap hand-off above that** — in every view, for free.
There is **no per-view header-inset axis**: `GroupedSections` owns `px-pane-gutter`
on its `SectionHeaderRow`, so every group header shares the one pane gutter (see
"Pane gutter" below) — no view passes a `headerClassName`.

**Why it is shared and not per-view.** It used to be per-view JSX and drifted three
ways: the gallery's headers never pinned at all while list's and table's stacked —
an oversight the next view child would have repeated. A lint rule can't state "a
grouped section must be wrapped in sticky chrome"; one shared branch makes the
divergence unrepresentable. See
`research/2026-07-17-data-view-gallery-sticky-group-headers.md`.

**`table` is the documented exception.** Its group headers are `col-span-full` rows
of `data-table`'s subgrid — chrome that owned a `<Stack>` would displace them out of
the grid and break column alignment — so it composes `StickyStack` directly inside
`data-table`, under the same policy and with `base` offset by its own sticky column
header. The tree renders through the shared chrome too, with one `TreeList` per
section: its ROOTS partition by the group-by field and every descendant follows
its root's section (see the tree child's CLAUDE.md "Group-by").

## Aggregating sections (`aggregate`)

Pass `aggregate?: DataViewAggregateConfig<TRow>` to `<DataView>` to collapse rows
sharing a key into a single **representative row + count badge**:

```ts
interface DataViewAggregateConfig<TRow> {
  getKey: (row: TRow) => string | null;            // null = standalone, never collapsed
  pickRepresentative?: (members: readonly TRow[]) => TRow;  // default: first in current order
}
```

It is a **pure pipeline transform**, orthogonal to the `supports*` flags — the
host threads it to every flat view (`list`/`table`/`gallery`), each of which runs
it through `useDataViewSections`. The aggregate step runs **after** group-by and
**after** the manual-order rank sort, **within each section**:

- entries sharing a non-null `getKey` collapse into ONE `DataViewRowEntry` with
  `row = pickRepresentative(members)` (default: the first member in current
  order), `aggregateCount = members.length`, and `members` = every collapsed row;
- the representative entry keeps the **position and `key` of the first member**
  (the entry stands for the group, not a single row);
- `getKey` returning **`null`** passes the row through 1:1 (no `aggregateCount`);
- `section.count` stays the **pre-collapse** member count.

Each view renders the representative normally and, when `entry.aggregateCount > 1`,
a `×N` `Badge` (`css/badge`) in its natural trailing spot — list **trailing**,
table **in the primary cell** (keyed by row identity, since the cell renderer
gets no index), gallery **top-left card corner** (a `Pin`, clear of the
hover-revealed top-right actions).

**"Acting on the representative acts on the group" is the consumer's concern.**
The representative is a real `TRow`, so `onRowActivate`, `itemActions`, and
`manualOrder.onMove` already fire on it; mapping that to a group mutation (e.g.
reseating every member) is the consumer's job. The primitive owns only the visual
collapse + representative selection + count badge. Composes with `manualOrder`:
dragging a representative moves the whole group via the consumer's reseat — no new
flag, aggregate is just a pipeline transform.

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

## Field extensions

Sometimes a `FieldDef` cannot be authored statically because its `value`
projection must close over **hook-loaded data** owned by *another* plugin (e.g. a
play-count keyed by row id living in another plugin's live resource).
`FieldDef.value` is a *synchronous* `(row) => FieldValue` and cannot call hooks,
so the field has to be produced from inside a mounted component.

**One contribution shape.** A field-extension contribution is a **component** (not
a plain `FieldDef[]`) typed `ComponentType<FieldExtensionProps<TRow>>`, where

```ts
interface FieldExtensionProps<TRow> {
  storageKey: DataViewId;                              // which surface
  rowKey: (row: TRow, index: number) => string;        // how to identify a row
  render: (fields: FieldDef<TRow>[]) => ReactNode;      // hand the host the fields
}
```

The component loads whatever it needs via hooks, closes its field `value`
projections over that data, and hands the fields back through `render`. Every
contributor receives the **surface coordinates** (`storageKey`, `rowKey`) so a
cross-cutting contributor can key its per-row data over the surface; a contributor
that doesn't need them just ignores them:

```tsx
function PlaybackFields({ render }: FieldExtensionProps<Song>) {
  const map = usePlaybackHistoryMap();
  const fields = useMemo<FieldDef<Song>[]>(() => [
    { id: "playCount", label: "Plays", type: "int",
      value: (s) => map.get(s.id)?.playCount ?? 0, sortable: true },
  ], [map]);
  return <>{render(fields)}</>;  // ignores storageKey/rowKey — it keys off its own resource
}
MyFields({ id: "playback", component: PlaybackFields });
```

**Two registration entry points, one mechanism.** A field extension reaches the
host through exactly one of two places — the difference is only the **registration
site** (and, consequently, the row typing):

1. **The always-on global `DataViewSlots.FieldExtension` slot** — the
   **cross-cutting** case: a single slot **every** DataView folds, for a
   contributor that augments *all* surfaces (custom-columns' user-defined columns).
   It is literally `defineFieldExtensions<unknown>("primitives.data-view.field-extension")`
   — the same factory, minted once at `<unknown>` (a global slot spans disjoint
   consumer row types, so the row type erases and `rowKey` is
   `(row: unknown, …) => string`). A cross-plugin contributor imports the slot and
   contributes itself (`custom-columns → data-view`, the legal parent-ward edge),
   so the host names **no** individual contributor.
2. **The per-consumer `defineFieldExtensions<TRow>(id)` factory** (web barrel), the
   sibling of `defineItemActions` — the **typed/scoped** case (disjoint row types
   per consumer → a factory, per the same collection-vs-factory rule). Each
   consumer calls it once with a stable id; the result is **callable for
   contributions** (`MyFields({ id, component })`, like any `defineRenderSlot`) and
   — being a slot — is itself the `FieldExtensionsDescriptor` the host reads (its
   `id` + `useContributions`; no extra `.Row`-style member, unlike item-actions).
   Pass it to `<DataView fieldExtensions={MyFields} />` (Sonata's play-count /
   last-played fields). Full `TRow` typing.

**One fold over an ordered source list.** The host (`CollectFieldExtensions`,
internal) folds a single ordered list of sources —
`[DataViewSlots.FieldExtension, ...(props.fieldExtensions ? [props.fieldExtensions] : [])]`
— threading `{ storageKey, rowKey }` to every contributor. It reads each source's
`useContributions()` and **recursively folds** the contributors into nested
render-callbacks — each mounts (error-boundary-isolated via `renderIsolated`), runs
its own hooks, yields its `FieldDef[]`, and recurses to the next contributor (then
the next source), finally calling `children([...base, ...allExtra])`. Both the
source-level and contribution-level folds are recursive **components** (never a
`.map` over contributed hooks, which `react-hooks/rules-of-hooks` rejects): the
source list and each contribution set are fixed at build time, so recursion depth
is stable and the per-component hook order never changes. The fold wraps the model
+ inner **before** the sort/filter controllers, so the merged `fields` reaches
`useSortController`, `useFilterController`, and `renderProps.fields` uniformly — a
contributed `int`/`date` field shows up in the Sort pill, the Filter pill, and the
table columns for free. No `fieldExtensions` prop → only the global slot is folded;
an empty global slot with no prop → a pass-through. This is the field-level
generalization of the old single-active-component-yields-an-ordered-list
render-callback pattern.

The fold runs at `<unknown>` (the global slot spans disjoint consumer row types),
so `props.fields`/`rowKey` and the merged result cross a safe
`FieldDef<unknown>`↔`FieldDef<TRow>` cast at the top-level `DataView` boundary. The
global slot is a `defineRenderSlot` under the hood (via `defineFieldExtensions`),
so its fold order is a committed reorder override
(`config/primitives/data-view/primitives.data-view.field-extension.jsonc`).

### Intentional asymmetry vs `RowOrder`

`GlobalFieldExtensionProps` is intentionally **gone** — a field extension is one
shape (`FieldExtensionProps<TRow>`) whether registered globally or per-consumer —
while the sibling **`GlobalRowOrderProps` remains**. That is deliberate:
`FieldExtension` had **two** cases (global custom-columns + per-consumer Sonata)
that were needlessly wearing two coats, so they were unified onto one contribution
shape + one fold. `RowOrder` has **only** a global case (the `view-order` plugin) —
no per-consumer variant exists — so its "Global" prop type is just its one shape.
Do **not** "restore symmetry" by re-splitting `FieldExtension` or by minting a
per-consumer `RowOrder` factory that has no consumer.

The global `RowOrder` slot is otherwise the same-shaped twin (always-on,
row-type-erased, surface coordinates threaded in, a recursive component fold, a
committed reorder override), but it folds a single `ManualOrderConfig | null` on a
first-non-null-wins rule instead of accumulating a `FieldDef[]`, and it is *gated*
rather than unconditional. See ["The global `RowOrder` slot"](#the-global-roworder-slot-cross-plugin)
under Manual order.

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

**Filter presets** are the twin of the sort presets: a named, reusable
`FilterGroup` saved in the sibling `filterPresets` key of the same per-surface
config doc (via the `presetsExtraFields` seam injected into the views descriptor —
view-core never names it). The filter pill's popover hosts the saved presets at the
top (apply = write the preset's group verbatim into the live filter) and a
`Save filter as preset` footer affordance, exactly like sort. The hook is
`useFilterPresets(storageKey)` (mirror of `useSortPresets`); the readers
`readFilterPresets` / `filterPresetMatchesGroup` live next to the sort readers.
A preset's group is stored opaquely as a `jsonField<FilterGroup>` (validated as a
whole through `FilterGroupSchema` on read), git-promotable like every config row.

### Typed fields are the generic extension point

To make a data-view filterable on a new dimension, **add a typed `FieldDef`** —
do **not** bolt a bespoke toggle chip onto the toolbar. A field whose `type`
resolves a `FilterOperatorSet` (`bool`, `enum`, `number`, `date`, `tags`, `text` —
all already registered) automatically appears in the "Filter" pill; `enum` fields
read their choices from `FieldDef.options`. This is also the generic substrate for
future configurability (saved filters, sort, grouping): they operate on the same
field schema, so a new typed field unlocks all of them at once with zero chrome code.

The **tree** view honors both **filter** (subtree-preserving) and **sort**. It
**defaults to manual (rank) order** — an empty `ViewState.sort` keeps rows in
rank order (the DnD-reorderable order) — and when a field sort is picked it
reorders each **sibling group** by that field (a stable global sort of the flat
row list, which `buildTree` re-groups per parent), suspending DnD reorder while
active. The `supportsSort: false` `DataViewContribution` flag (a data-view flag,
*not* a generic `ViewTypeMeta` key — view-core never knows about sort) still
exists for any future view type with no meaningful field-sort axis; when set the
host hides the Sort pill while keeping the Filter pill. Default (flag omitted) =
honors sort, which is what the tree now does.

Body rendering is **show-all by default** and governed per view-instance by
`visibleFields` (see "Per-view visible fields (Properties)" below) — it is *not*
tied to `primary`. With the `null` default every view, **including the tree**,
renders all schema fields: the tree shows the primary field as the row label and
every non-primary field as read-only trailing chips. A field is therefore visible
in the body **and** usable in the filter builder unless a surface explicitly hides
it. To keep a field **filter-only** (a pure filter dimension that never appears in
the body), author a narrow `visibleFields` on that view that omits it (and set
`filterable: false` to also keep it out of the full-text search accessor).

The settings config nav is the worked example — its `modified` (bool), `conflict`
(bool), and `source` (enum) fields are deliberate filter-only dimensions, so its
tree view authors `visibleFields: ["label"]` (in
`config/config_v2/settings/config_v2.settings.nav.jsonc`) to keep the body to just
the config name while those three stay usable in the "Filter" pill. (The studio
explorer tree and the code-explorer file tree author the same narrow
`visibleFields: ["name"]` for the same reason — their badges/icons already convey
the secondary dimensions.)

## Per-view visible fields (Properties)

Which fields a view renders in its **body**, and in what order, is a per-view-instance
dimension — the visible-fields twin of `sort` / `filter`, stored in the **same `view`
blob** as `visibleFields?: string[] | null`:

- **`null` / absent (the default)** → **show all** schema fields, in schema order.
  Newly added fields (including a freshly added custom column) auto-appear with zero
  user action.
- **explicit `string[]`** → exactly those field ids, in that order; everything else is
  hidden. Order is meaningful — it is the body order (table columns, gallery/list
  property rows, tree secondary chips). Like Notion, once a view is customized,
  later-added fields stay hidden until toggled on.

`visibleFields` governs **body rendering only**. Filter, sort, and search always
operate on the **full** `FieldDef[]` schema — a hidden field stays filterable and
sortable. The shared `resolveBodyFields(fields, visibleFields)` helper maps the blob
to the ordered visible subset each view renders; the primary/title slot in
gallery/list/tree is then `pickPrimaryField` over that **visible** subset (so a hidden
title falls back to the next visible text field).

Users edit this from the **settings gear** (`MdTune`) — the **"Properties"** entry in
its "Current view" section, a `view`-scope `DataViewSlots.Setting` contribution
(`PropertiesControl`) sitting alongside "Group by": a sortable, checkbox list to
reorder / hide fields, plus a "Show all fields" reset (back to `null`). The setting
gates itself to surfaces with more than one field (via the contribution's
`isApplicable`, which the menu reads generically — it never names Properties). Writes
go to the view's config row exactly like sort/filter (`updateView(id, { visibleFields }, { merge: true })`),
so the choice is durable and git-promotable. Surfaces that want a deliberately narrow
body (e.g. a tree whose secondary dimensions are already shown as badges) author
`visibleFields` directly in their committed `.jsonc` — see the config-nav worked
example under "Filtering".

## Pane gutter

Every horizontal band the DataView primitive owns — the toolbar, each view body
(list / gallery / tree), the grouped-section headers, the table rows (via
`DataTable`'s opt-in `gutter` prop), and the loading skeletons — reads the **one
shared pane-gutter rail** through the `px-pane-gutter` utility:

```css
px-pane-gutter → padding-inline: var(--pane-gutter, var(--chrome-pad-x));
```

Because the fallback is the pane header's own inset token (`--chrome-pad-x`),
**nothing needs to publish the var by default**: the rail auto-aligns with the pane
header's `px-chrome` (12px comfortable, density-scaled 12/10/8), so a DataView
dropped into a pane lines up with the pane title with zero setup. The var is purely
an override point:

- A **host that already supplies its own horizontal inset** (task-detail's `Inset`,
  the workflows detail card, and — generically — every `detail-sections` content
  container) adds the **`pane-gutter-flush`** utility (`--pane-gutter: 0px`) so the
  gutter isn't double-applied. `detail-sections` does this once for ANY DataView
  dropped into a detail section, so those consumers need no per-site opt-out.
- A **custom rail value** (none today) is set by writing the exported
  `PANE_GUTTER_VAR = "--pane-gutter"` constant as an inline style on an ancestor —
  the same host-publishes / consumers-read convention as `DATA_VIEW_HEADER_OFFSET_VAR`
  (`--dv-header-offset`) and `--chrome-mask`.

The utilities are **horizontal-only**; vertical rhythm stays on the named spacing
ramp.

## Placement: always natural-height, never owns a scroll

`<DataView>` has **no placement mode** — it is **always natural-height** and
**never owns a scroller**. The root is a plain block box (`<Stack gap="none">` =
`flex flex-col`, *no* `min-h-0 flex-1`), so the body grows to its natural content
height and the **enclosing pane owns exactly one scroll**, provided by
`<PaneScroll>` (`@plugins/primitives/plugins/pane/web`). The single-scroll model
removes the whole class of nested/severed-scroll bugs — a DataView dropped into a
flex-severed wrapper can no longer balloon to full content height and starve the
scroll.

- **The toolbar is a `<Sticky edge="top" mask>` header.** It pins against the
  pane's scroll viewport, staying visible whether the DataView is the pane's sole
  content or one of several stacked sections. The `<Stack gap="none">` root is
  each DataView's own sticky **containing block**, so stacked DataViews hand off
  automatically — when a section scrolls out its toolbar un-pins with it, no
  `active` toggling or computed `top` offsets. The `mask` prop paints
  `bg-chrome-mask` so rows never show through the pinned bar — and because that
  follows the surface the DataView is embedded in (page canvas, sidebar,
  `<Surface>`), the bar never becomes a mismatched band in a tinted surface.
- **The pane provides the scroll.** A pane body is one `<PaneScroll>` viewport;
  every header within it (the DataView toolbar, a section's stats header) is a
  `<Sticky>`. `PaneChrome` routes its body through `<PaneScroll>` for free, so a
  DataView rendered as `PaneChrome` children scrolls for free; a non-pane host
  must supply its own `<PaneScroll>` (or equivalent `overflow-y` scroller) around
  the DataView.

**Dev-mode structural guards.** On mount `<DataView>` runs two loud-but-non-fatal
checks (`console.error`, never throw — safe for overlay/SSR edges), after one
layout frame (`use-dev-guards.ts`):

1. **Single-scroll.** Walks up for the nearest ancestor the content vertically
   overflows; if that ancestor clips (`overflow-y ∉ {auto, scroll, overlay}`) the
   pane forgot its `<PaneScroll>` and the view is unscrollable.
2. **Chrome-mask match.** The sticky toolbar masks with `--chrome-mask`, which
   must equal the actual painted background behind the DataView for the pinned bar
   to look seamless. Every `<Surface>` (and the page canvas / sidebar / theme
   scope) co-publishes `--chrome-mask` alongside its background, so this holds by
   construction for surfaces built through the primitive. This guard compares the
   root's computed `--chrome-mask` against the nearest actually-painted ancestor
   background and errors on a mismatch — catching an **ad-hoc** `bg-muted`/`bg-card`
   wrapper that paints a surface without co-publishing (the case a lint can't see,
   since the surface is a runtime ancestor and those tokens have no
   false-positive-free static fingerprint). Fix: route the wrapper through
   `<Surface>`, which co-publishes `--chrome-mask`.

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

Every view windows today, each at the threshold its own row shape justifies, and
always **within** a group section (grouping is the outer structure, windowing the
inner one — so a section's header is always mounted and `StickyStack` can measure
it):

| View | Threshold | Notes |
|---|---|---|
| **list** | 100 entries | Composes with manual-order drag via `keepMounted`. |
| **gallery** | 60 cards | Lane-aware: each windowed row is one measured row of `columns` cards. |
| **tree** | 100 *visible* (expanded) rows | Inside `primitives/tree`'s `TreeList`; below that the recursive render runs byte-for-byte unchanged. Uses `scrollToIndex` for selection reveal. |
| **table** | 100 rows, **ungrouped only** | Grouped mode is never windowed — it targets bounded, sectioned lists — and uses grid-flow spacers rather than absolute positioning, so the subgrid's column tracks stay aligned. |

Background: `research/2026-06-18-data-view-row-virtualization.md` and
`research/2026-06-18-tree-view-virtualization.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter. Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.
- Web:
  - Slots:
    - `DataViewSlots.View` ← `primitives.data-view.gallery`, `primitives.data-view.list`, `primitives.data-view.table`, `primitives.data-view.tree`
    - `DataViewSlots.FieldExtension` ← `primitives.data-view.custom-columns`
    - `DataViewSlots.RowOrder` ← `primitives.data-view.view-order`
    - `DataViewSlots.Setting` ← `primitives.data-view`, `primitives.data-view.custom-columns`
    - `DataViewSlots.Cell` ← `fields.bool.table`, `fields.color.table`, `fields.date.table`, `fields.enum.table`, `fields.image.table`, `fields.number.table`, `fields.tags.table`, `fields.text.table`
    - `DataViewSlots.CellEditor` ← `fields.bool.inline`, `fields.date.inline`, `fields.enum.inline`, `fields.number.inline`, `fields.tags.inline`, `fields.text.inline`
    - `DataViewSlots.Filter` ← `fields.bool.filter`, `fields.date.filter`, `fields.enum.filter`, `fields.number.filter`, `fields.tags.filter`, `fields.text.filter`
    - `DataViewSlots.ValueCodec` ← `fields.bool.data-view-codec`, `fields.date.data-view-codec`, `fields.number.data-view-codec`
    - `DataViewSlots.ColumnConfig` ← `fields.enum.column-config`
  - Contributes:
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `ConfigV2.WebRegister`
    - `DataViewSlots.Setting` "data-view.properties" → `PropertiesControl`
    - `DataViewSlots.Setting` "data-view.group-by" → `GroupByControl`
  - Uses:
    - `config_v2.useConfig`
    - `config_v2.useSetConfig`
    - `primitives/collapsible.CollapsibleContent`
    - `primitives/collapsible.CollapsibleProvider`
    - `primitives/css/center.Center`
    - `primitives/css/fill.Fill`
    - `primitives/css/inline.Inline`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/row.Row`
    - `primitives/css/row.SectionHeaderRow`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/selection-indicator.CheckboxIndicator`
    - `primitives/css/spacing.Inset`
    - `primitives/css/spacing.Stack`
    - `primitives/css/sticky.Sticky`
    - `primitives/css/sticky/stack.StickyStack`
    - `primitives/css/sticky/stack.StickyStackItem`
    - `primitives/css/surface.Surface`
    - `primitives/css/text.SectionLabel`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.ToggleChip`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/css/ui-kit.DropdownMenu`
    - `primitives/css/ui-kit.DropdownMenuContent`
    - `primitives/css/ui-kit.DropdownMenuItem`
    - `primitives/css/ui-kit.DropdownMenuSection`
    - `primitives/css/ui-kit.DropdownMenuSeparator`
    - `primitives/css/ui-kit.DropdownMenuTrigger`
    - `primitives/css/ui-kit.Input`
    - `primitives/css/ui-kit.SingleLineProvider`
    - `primitives/cursor-pagination.InfiniteScrollFooter`
    - `primitives/cursor-pagination.InfiniteScrollHandle`
    - `primitives/cursor-pagination.useInfiniteScroll`
    - `primitives/data-view/view-core.buildViewConfigContributions`
    - `primitives/data-view/view-core.buildViewDescriptors`
    - `primitives/data-view/view-core.EditableViewSwitcher`
    - `primitives/data-view/view-core.ResolvedViewInstance`
    - `primitives/data-view/view-core.useViewModel`
    - `primitives/data-view/view-core.useViewVariants`
    - `primitives/element-size.useElementSize`
    - `primitives/hover-reveal.hoverRevealClass`
    - `primitives/hover-reveal.useHoverReveal`
    - `primitives/icon-button.IconButton`
    - `primitives/latest-ref.useLatestRef`
    - `primitives/loading.Loading`
    - `primitives/popover.InlinePopover`
    - `primitives/search.SearchInput`
    - `primitives/search.useTextFilter`
    - `primitives/slot-render.defineDispatchSlot`
    - `primitives/slot-render.defineRenderSlot`
    - `primitives/slot-render.renderIsolated`
    - `primitives/slot-render.RenderSlot`
    - `primitives/sortable-list.SortableItem`
    - `primitives/sortable-list.SortableList`
  - Exports (types):
    - `CellEditorProps`
    - `ColumnConfigProps`
    - `CreateOption`
    - `DataViewAggregateConfig`
    - `DataViewContribution`
    - `DataViewId`
    - `DataViewProps`
    - `DataViewRenderProps`
    - `DataViewRowEntry`
    - `DataViewSection`
    - `DataViewSettingContribution`
    - `DataViewSettingsContextValue`
    - `DataViewSourceBundle`
    - `DataViewSourceContribution`
    - `DataViewSourceProps`
    - `DataViewSources`
    - `FieldCellProps`
    - `FieldDef`
    - `FieldExtensionContribution`
    - `FieldExtensionProps`
    - `FieldExtensions`
    - `FieldExtensionsDescriptor`
    - `FieldValue`
    - `FilterConjunction`
    - `FilterController`
    - `FilterFieldValue`
    - `FilterGroup`
    - `FilterNode`
    - `FilterOperator`
    - `FilterOperatorSet`
    - `FilterPreset`
    - `FilterRule`
    - `FilterValueInputProps`
    - `GlobalRowOrderContribution`
    - `GlobalRowOrderProps`
    - `GroupByController`
    - `GroupedSectionsProps`
    - `HierarchyConfig`
    - `ItemActionContribution`
    - `ItemActionProps`
    - `ItemActions`
    - `ItemActionsDescriptor`
    - `ManualOrderConfig`
    - `MergedDataViewProps`
    - `SelectionConfig`
    - `ServerDataSourceResult`
    - `ServerDataSourceSpec`
    - `ServerPage`
    - `SortController`
    - `SortPreset`
    - `SortRule`
    - `TableCellProps`
    - `ValueCodec`
    - `ViewState`
  - Exports (values):
    - `applyFilter`
    - `ChipSelectFilterInput`
    - `DATA_VIEW_HEADER_OFFSET_VAR`
    - `DataView`
    - `DataViewSlots`
    - `defineDataView`
    - `defineDataViewSources`
    - `defineFieldExtensions`
    - `defineItemActions`
    - `EditableCell`
    - `evaluateNode`
    - `FieldCell`
    - `FilterValueInput`
    - `getDataViewDescriptor`
    - `GroupedSections`
    - `IDENTITY_CODEC`
    - `isFilterGroup`
    - `isGroupableField`
    - `makeSortComparator`
    - `MergedDataView`
    - `PANE_GUTTER_VAR`
    - `partitionIntoSections`
    - `pickPrimaryField`
    - `resolveBodyFields`
    - `useDataViewSections`
    - `useDataViewSettings`
    - `useFieldIdentities`
    - `useFilterController`
    - `useFlatRows`
    - `useGroupByController`
    - `useResolveCell`
    - `useResolveCellEditor`
    - `useResolveColumnConfig`
    - `useResolveOperatorSet`
    - `useResolveValueCodec`
    - `useServerDataSource`
    - `useSortController`
- Server:
  - Contributes:
    - `ConfigV2.Register` "agent-launches"
    - `ConfigV2.Register` "agents-list"
    - `ConfigV2.Register` "all-conversations"
    - `ConfigV2.Register` "build.history"
    - `ConfigV2.Register` "code-explorer.file-tree"
    - `ConfigV2.Register` "config_v2.settings.nav"
    - `ConfigV2.Register` "conversations-sidebar"
    - `ConfigV2.Register` "debug.boot-profiles"
    - `ConfigV2.Register` "debug.config-orphans"
    - `ConfigV2.Register` "debug.profiling.runtime"
    - `ConfigV2.Register` "debug.reports"
    - `ConfigV2.Register` "debug.slow-ops.cluster-aggregate"
    - `ConfigV2.Register` "debug.slow-ops.cluster-timeline"
    - `ConfigV2.Register` "debug.slow-ops.local"
    - `ConfigV2.Register` "debug.trace.events"
    - `ConfigV2.Register` "deploy.servers"
    - `ConfigV2.Register` "home.apps"
    - `ConfigV2.Register` "mail-inbox"
    - `ConfigV2.Register` "page.links.backlinks"
    - `ConfigV2.Register` "pages-sidebar"
    - `ConfigV2.Register` "prototypes.gallery"
    - `ConfigV2.Register` "sonata.library"
    - `ConfigV2.Register` "story.gallery"
    - `ConfigV2.Register` "studio.compositions"
    - `ConfigV2.Register` "studio.compositions.closure-tree"
    - `ConfigV2.Register` "studio.explorer.tree"
    - `ConfigV2.Register` "studio.release.history"
    - `ConfigV2.Register` "task-deps-tree"
    - `ConfigV2.Register` "tasks-list"
    - `ConfigV2.Register` "tasks-subtree"
    - `ConfigV2.Register` "tweakcn.community-browser"
    - `ConfigV2.Register` "tweakcn.quick-theme"
    - `ConfigV2.Register` "workflows.definitions"
    - `ConfigV2.Register` "workflows.executions"
  - Uses:
    - `config_v2.getConfig`
    - `primitives/data-view/view-core.buildViewConfigRegistrations`
    - `primitives/data-view/view-core.viewsDescriptor`
  - Exports (values): `readDataViewConfigDoc`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/servers`
    - `apps/home/app-cards`
    - `apps/mail/inbox`
    - `apps/pages/page-tree`
    - `apps/prototypes/gallery`
    - `apps/sonata/library`
    - `apps/story/shell`
    - `apps/studio/compositions`
    - `apps/studio/compositions/closure-tree`
    - `apps/studio/compositions/release`
    - `apps/studio/explorer`
    - `apps/workflows/definitions`
    - `apps/workflows/executions`
    - `build`
    - `code-explorer`
    - `config_v2/settings`
    - `conversations/agents`
    - `conversations/all-conversations`
    - `conversations/conversations-view/data-view`
    - `conversations/conversations-view/data-view/history`
    - `conversations/conversations-view/data-view/queue`
    - `debug/boot-profile`
    - `debug/config-orphans`
    - `debug/profiling/runtime`
    - `debug/reports`
    - `debug/slow-ops/cluster`
    - `debug/slow-ops/pane`
    - `debug/trace/pane`
    - `fields/bool/data-view-codec`
    - `fields/bool/filter`
    - `fields/bool/inline`
    - `fields/bool/table`
    - `fields/color/table`
    - `fields/date/data-view-codec`
    - `fields/date/filter`
    - `fields/date/inline`
    - `fields/date/table`
    - `fields/enum/column-config`
    - `fields/enum/filter`
    - `fields/enum/inline`
    - `fields/enum/table`
    - `fields/image/table`
    - `fields/number/data-view-codec`
    - `fields/number/filter`
    - `fields/number/inline`
    - `fields/number/table`
    - `fields/tags/filter`
    - `fields/tags/inline`
    - `fields/tags/table`
    - `fields/text/filter`
    - `fields/text/inline`
    - `fields/text/table`
    - `page/links`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/gallery`
    - `primitives/data-view/list`
    - `primitives/data-view/server-query`
    - `primitives/data-view/table`
    - `primitives/data-view/tree`
    - `primitives/data-view/view-order`
    - `release`
    - `tasks/task-deps-tree`
    - `tasks/task-list`
    - `ui/tweakcn/community-browser`
- Core:
  - Exports (types):
    - `CellEditorProps`
    - `ColumnConfigProps`
    - `CreateOption`
    - `DataViewAggregateConfig`
    - `DataViewId`
    - `DataViewProps`
    - `DataViewRenderProps`
    - `DataViewRowEntry`
    - `DataViewSection`
    - `FieldDef`
    - `FieldExtensionProps`
    - `FieldExtensionsDescriptor`
    - `FieldValue`
    - `FilterConjunction`
    - `FilterFieldValue`
    - `FilterGroup`
    - `FilterNode`
    - `FilterOperator`
    - `FilterOperatorSet`
    - `FilterPreset`
    - `FilterRule`
    - `FilterValueInputProps`
    - `HierarchyConfig`
    - `ItemActionProps`
    - `ItemActionsDescriptor`
    - `ManualOrderConfig`
    - `SelectionConfig`
    - `ServerDataSourceSpec`
    - `ServerPage`
    - `SortPreset`
    - `SortRule`
    - `TableCellProps`
    - `ValueCodec`
    - `ViewState`
  - Exports (values):
    - `DATA_VIEW_HEADER_OFFSET_VAR`
    - `defineDataView`
    - `FilterGroupSchema`
    - `FilterNodeSchema`
    - `FilterRuleSchema`
    - `IDENTITY_CODEC`
    - `PANE_GUTTER_VAR`
- Sub-plugins:
  - **`custom-columns`** — User-defined custom columns for any DataView: the config-backed definition controller, the per-row values live hook + upsert mutation, and the toolbar settings (Fields) button. Persists per-row custom-column values keyed by (dataViewId, rowKey, columnId): a generic DB table, a push live resource, and an upsert/delete-on-empty endpoint.
  - **`gallery`** — Gallery view child for the data-view primitive: a responsive card grid with a field-driven default card plus a composable DataCard chrome.
  - **`list`** — List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.
  - **`server-query`** — Generic FilterGroup → SQL compiler for server-delegated data-view sources, plus the DataViewServer.QueryAugmentor registry (server twin of the web FieldExtension slot) that lets sub-plugins inject extra joined sort/filter columns. Field-type agnostic: operator SQL is supplied by an injected resolver, so this owns drizzle and the filter compilation, not any field type. The field-agnostic keyset seek + cursor codec now live in primitives/keyset.
  - **`table`** — Table view for data-view: maps the typed field schema to data-table columns with host-controlled sort.
  - **`tree`** — Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).
  - **`view-core`** — Type-agnostic named-view-instance engine: instance model + resolver, config-descriptor machinery, debounced write-back, and the editable view-switcher chrome. Type-agnostic named-view-instance engine (server): the per-id `views` config descriptor + a generic registration helper. Consumers register their own ids under their own plugin.
  - **`view-order`** — Per-view-instance manual row order for any DataView: subscribes to the persisted (dataViewId, viewId) ranks, synthesizes a total order, and contributes the resulting ManualOrderConfig back through data-view's global RowOrder slot. Persists a per-view-instance manual row order keyed by (dataViewId, viewId, rowKey): a generic DB table, a push live resource, and a validating upsert endpoint that writes only the drag's bounded set (the moved row plus the seeds now ahead of it) rank-ascending — O(gesture), never a full replace, nothing deleted.

<!-- AUTOGENERATED:END -->
