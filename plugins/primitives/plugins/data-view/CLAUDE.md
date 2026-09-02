# data-view

A Notion-like multi-view data surface. One **data source** — `rows` plus a typed
`FieldDef[]` schema — rendered through multiple **views** (gallery, table, …), each
view independently sorted / searched / filtered.

## Architecture

- A single **global `DataViewSlots.View` slot** (a plain `defineSlot`, rendered via
  `renderIsolated`). Each view type is a child plugin contributing one
  `DataViewContribution` keyed by its **`type`** id (`"table"`, `"gallery"`, …).
  This mirrors the `segmented-progress-bar` precedent (one global `Variant` slot,
  children contribute variants) — the inverse of the `defineTabbedView` factory,
  which exists because each tab host has a *different* set of tabs. Our views are a
  *fixed shared vocabulary*.
- **view-type vs view-instance.** A `DataViewContribution` is a registered
  view-*type* (the renderer: `type`, `title`, `icon`, `component`, optional
  `configSchema`). The host renders **view-instances** — a named,
  individually-configured *use* of a view-type, `{ id, name, type, options }`,
  authored in config (below); there is **no code-synthesized default mode**. The
  public `views={[…]}` whitelist is a list of **type** ids, gating the
  addable-types `+` menu.
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

Every `<DataView>` is config-backed — there is **no per-mount mode branch**, and
**zero per-consumer registration boilerplate**. This mirrors `reorder` exactly:
build-time codegen scrapes the markers, the primitive registers one
`viewsDescriptor` per id under each defining plugin.

- **`defineDataView("id")` marker** (`core/internal/define-data-view.ts`) declares
  a surface id: asserts the grammar `^[a-zA-Z0-9._-]+$` (bans `:` so the id is a
  filename-safe config name) and brands the string `DataViewId` (the type of
  `DataViewProps.storageKey`). The brand is the structural guarantee — a consumer
  cannot pass a raw string, so every id is discoverable.
- **Codegen** (`framework/tooling/codegen/.../data-views-gen.ts`) scans every
  plugin's `web/**` for `defineDataView(...)` calls and emits the sorted
  `{ id, pluginId }` list to `shared/data-views.generated.ts` — `pluginId` being the
  *defining* plugin, so the config lands in the consuming plugin's tree.
  `data-views-in-sync` fails on drift; `./singularity build` regenerates it.
- **Registration** (`{web,server}/internal/{descriptors,config-registrations}.ts`)
  builds one reference-stable `viewsDescriptor` per id and spreads one
  `ConfigV2.{WebRegister,Register}` per id, **each passing the entry's own
  `pluginId`** so config_v2 derives `config/<asPath(pluginId)>/<id>.jsonc` (e.g.
  `config/apps/sonata/library/sonata.library.jsonc`). `useViewsConfig` resolves it
  via `dataViewDescriptors.get(storageKey)` — reference identity vs the
  registration, like `reorderDescriptors.get(slotId)`.

### Config is the single source of truth (fail by default)

There is **no code synthesis** of default view-instances (view-core owns the
resolver — see its CLAUDE.md). The displayed instances come **only** from the
authored `config.views` rows; zero rows → `<DataView>` renders a `Placeholder`
("No views configured — author `config/<plugin>/<id>.jsonc`") instead of crashing.
**That placeholder is only reachable once the config is KNOWN.** `useDataViewModel` returns
a union (`{ ready: false } | (ReadyViewModel & { ready: true })`), and the shell renders a
`Loading` skeleton on the loading arm — a surface whose config has not arrived has zero
instances too, and claiming it is unconfigured is a wrong answer the user then watches get
rewritten.
The forcing function that an agent compose the views in config rather than rely on
a code fallback is the views descriptor's config_v2 **`requiresAuthoredOverride`**
opt-in (in `view-core`'s `views-descriptor.ts`, carrying the authoring guidance as
prose): `./singularity build` **seeds** `config/<plugin>/<id>.jsonc` from its
origin and stamps a `// @review` marker into it, and the generic
**`config:overrides-authored`** check (`plugins/config_v2/check/`) fails while that
marker is present. The marker tests *review* — mere presence is not enough (a
`{"views": []}` file renders "No views configured" at runtime).

### The view config row

A row is authored terse (`{ name, view }`); view-core's `normalizeRows` derives
`id` on read and **array position is the canonical order** (no `rank` field) — see
view-core's CLAUDE.md. The `view` blob is `{ type, sort?, filter?, …opts }`;
`sort`/`filter`/`groupBy` are host-injected keys read via `viewFor`/`updateView`.
`groupBy` is a `GroupByRule` (`{ fieldId, groupingId }` — see "Grouping is a field-type
contribution"), with the legacy bare `"<fieldId>"` string migrated on read. `sort` is a
`SortRule[]` (ordered multi-level; each `{ fieldId, direction }`, priority = list
order, `[]` = unsorted) and `filter` a `FilterGroup` tree. **Legacy single-`sort`
is migrated on read** — a persisted `{ fieldId, direction }` object (the old
`SortState` shape, still on disk in committed configs) coerces to `[obj]`; the file
is re-serialized to the array shape only when the user edits sort, never
proactively. The origin default stays `{ "views": [] }` with a stable hash
(independent of the registered view-types), so adding a view-type never
invalidates committed configs.

### Adoption is enforced (`no-adhoc-row-list`)

The complementary forcing function: the `data-view/no-adhoc-row-list` lint rule
(`lint/no-adhoc-row-list.ts`, `error` repo-wide) bans hand-rolling a data list as
a `.map()` of `<Row>` in feature code. Genuine transient chrome (menus, pickers,
tab strips, typeaheads) keeps `Row` with
`// eslint-disable-next-line data-view/no-adhoc-row-list -- <reason>`; the
row-rendering machinery itself (this plugin's view children, `primitives/tree`,
`reorder/editor`) is permanently exempt via the rule's `ignores`. The two checks
bracket the choice: `no-adhoc-row-list` fires when you avoid DataView,
`config:overrides-authored` fires until you finish adopting it.

### The model, and where each piece of state lives

The single model is `useConfigViewModel`: config-authored instances, full
instance actions (add / rename / duplicate / delete / reorder / options
sub-form), the `EditableViewSwitcher`, and per-instance sort/filter written
**back to the config row** (durable, git-promotable). Runtime edits write the
**user-global layer** (`setConfig` with no `scopeId`, mirroring reorder) — an
`app:` scopeId would write a scope key the read path ignores until the scope is
forked, silently dropping edits on reload. The per-id descriptor already scopes
views to one surface; per-app forking stays a Settings-pane concern.

**State split** (`web/internal/use-view-ephemeral.ts` → `useViewEphemeral`, Web
Storage for non-config state):

| State | Lives in |
|---|---|
| Instance def `{ id, name, view:{ type, sort?, filter?, …opts } }` (array-ordered) | `viewsDescriptor` config row (user-global layer) |
| Active instance id | localStorage `${storageKey}:active-view` (per device) |
| Tree expand map, collapsed group sections | localStorage `${storageKey}:view-state` (per device) |
| Search query | **sessionStorage** `${storageKey}:view-query` (per browser tab) |

The localStorage reader ignores legacy `sort`/`filter`/`query` keys in a
`view-state` blob, so no migration is needed.

**The search query is per-tab on purpose — do not move it back to
`localStorage`.** Durable narrowings are the config row's (`sort`/`filter`/
`groupBy`) and render as visible chips; a query is an ad-hoc gesture that outlives
its intent if it survives a browser restart, leaving a filtered subset that reads
as the view's whole contents. `sessionStorage` keeps the only property worth
persisting (F5 doesn't lose your place). If a query ever *should* survive, put it
in the URL — shareable, and the back button clears it.

**The expand map is the home for tree collapse state — do not put it on a domain
entity.** Collapse is per-`(surface, view-instance, row)` render state, and the
map above already keys on exactly that triple. Storing it as an entity column
instead (an `expanded` field on the row's own table) is an anti-pattern with three
concrete failure modes, all of which the repo has actually hit:

- **One flag cannot serve two views.** Two view instances over the same rows — or
  a scoped sub-tree of them, or the same tree on two devices — fight over a
  single value, so collapsing in one silently collapses the other.
- **It writes the domain.** A collapse becomes a DB write plus a change-feed
  recompute plus a live-state push to every client, and it stamps the row's
  `updatedAt` — so a purely local UI gesture rewrites a visible, sortable field.
- **It does not bound.** Expand-all is inherently `O(nodes-with-children)` and, unlike
  `view-order`'s ranks, has no invariant to exploit for a bounded write.

The map is the **only** source. `tree/web/internal/project-rows.ts` resolves a
row's expansion as `expanded?.[id] ?? defaultExpanded ?? false` — there is no
consumer-supplied accessor left to shadow it, so a collapse simply cannot be
domain data. See
`research/2026-07-28-global-tree-collapse-state-as-view-state.md` and
`research/2026-07-29-global-delete-hierarchy-expand-hooks.md`.

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
  hooks, and **must always call `render(bundle)`** — pass `{ rows: [], loading:
  true, … }` while loading; an early `return null` makes the surface chrome
  vanish. The bundle is `DataViewSourceBundle<TRow>` = `DataViewProps` minus
  the shell-owned keys (`storageKey`/`title`/`actions`/`defaultView`/`views`).
- **`views` / `hasHierarchy` are STATIC contribution metadata**, not bundle
  keys, on purpose: the view model must resolve *every* config row (switcher
  chips, add-menu gating, the hierarchical gate) before any source component
  mounts — and only the ACTIVE source ever mounts. Everything dynamic (rows,
  fields, the actual `hierarchy` accessors, `viewOptions`, `dataSource`, …)
  stays in the bundle; the host dev-warns when a bundle's `hierarchy` presence
  contradicts the declared `hasHierarchy`. Code-only `viewOptions`
  (`renderRow`, `renderBody`, …) reach the view through the body's options
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
`HierarchyConfig` carries two required accessors (`getParentId`, `getRank`), the
optional reference-edge accessor (`getAliasParents`, below), and the optional
mutations (`onMove`, `onCreate`) — so a read-only nav tree supplies just the two
required accessors.

**Expand is not one of them, and never can be.** There is no
`isExpanded`/`onToggleExpanded` pair: collapse is always the primitive's own
per-`(surface, view-instance, row)` map (see "State split" above), which makes
the anti-pattern documented there unrepresentable rather than merely
discouraged. It also retires the half-wired state the pair admitted — the two
were independently optional, so supplying one gave a chevron whose write went to
the view map and whose read came off the row: a silently dead toggle no check
could catch. The "click a folder to open it" affordance that motivated a
consumer-side accessor is now the **stateless** `expandOnActivate` predicate on
the tree view's `options` (see the tree child's CLAUDE.md); carrying no state,
it cannot be half-wired.

The `FieldDef.primary` flag selects the tree row label field (shared
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
  // within one section
  onMove: (id: string, dest: {
    rank: Rank; targetId?: string; zone?: "before" | "after";
  }) => void | Promise<void>;
  // across sections — group write + reorder; absent ⇒ such drops are refused
  onReseat?: (id: string, dest: {
    groupKey: string | null; targetId: string; zone: "before" | "after";
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

Notion's model, and ours: with **no sort set**, a `list`/`table` view renders in
manual order and rows are draggable; setting a **field sort overrides** it and
suspends drag (the host simply withholds the config; `useDataViewSections`'s
`manualRank ⇒ sort: []` rule is untouched); **clearing the sort restores** it.
Consequently the **Sort control stays visible** in manual mode — it must stay
reachable to clear the sort. It is also the *only* remaining thing that suspends
drag, so the sort popover says so in a muted footer line whenever an order exists
and a sort is shadowing it (`manualOrderOverridden`) — the cause is never silent.

When a config is active for the displayed view:

- the section pipeline **skips the field sort** and orders each section's entries
  by `getRank` (search/filter still run) — like the tree ignores `ViewState.sort`;
- rows render with rank-reorder drag affordances via the **`rank-reorder`**
  primitive (`RankReorderProvider` + `useRankReorderItem`), the same DnD machinery
  the tree's sibling zones use — one reorder model, not two;
- reordering is **within a section** (`onMove`). A cross-section drop needs the
  group-by field written, which only the consumer can do, so it is a separate
  capability expressed by **handler presence**: with `onReseat` the drop is
  allowed and reported anchor-only (`{ groupKey, targetId, zone }`); without it
  the other sections' rows disable their drop zones for the duration of the drag,
  so the refusal is **visible** rather than a drop-time no-op (see
  `rank-reorder`'s CLAUDE.md);
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

The host folds it in `CollectRowOrder` (`web/internal/row-order.tsx`) — the same
recursive-component fold as `CollectFieldExtensions` (see Field extensions), but
resolving a single `ManualOrderConfig | null` on a **first-non-null-wins** rule
instead of accumulating a `FieldDef[]`, and *gated* rather than unconditional. Each
contributor mounts error-boundary-isolated (`renderIsolated`), runs its own hooks,
and hands back a config (or `null` to abstain) through `render`. Because the slot
is a `defineRenderSlot`, that precedence is a committed reorder override
(`config/primitives/data-view/primitives.data-view.row-order.jsonc`), not an
import-order accident.

**`rows` is the view's ordered set: filter-applied, search-EXCLUDED,
sort-suppressed** — computed with
`useFlatRows(effectiveRows, fields, { ...activeState, sort: [], query: "" }, …)`.
Rows the view filters out never receive a rank. Search only changes what is
*rendered*, never which rows the order covers, so a drag under an active search
still resolves against the full ordered set. The contributor nonetheless persists
only a bounded write set per gesture — see view-order's CLAUDE.md.

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
  aggregate == null;             // an aggregate representative's rank cannot stand for its members
```

**Group-by is deliberately absent too.** It used to be a clause, which is what
made drag silently stop working under the Pages sidebar's default `groupBy`.
Within-section reordering is well-defined — the contributed order covers the
whole *unpartitioned* set (`CollectRowOrder` feeds it filter-applied,
search-excluded rows), so a drop anchored on a same-section neighbour resolves
globally — and the one unsupported case, a drop into another section, is refused
per-drop by the view (above), not by suspending the whole order.

**The sort test is deliberately absent here.** It lives in `manualOrderActive`
(`cfg != null && activeSupportsManualOrder && activeState.sort.length === 0`)
instead, so toggling a sort off and on does not tear down the contributor's live
subscription — the host merely withholds the config while a sort is set.

## Grouping is a field-type contribution

**data-view names no field type.** How a field's values partition into sections
is declared by the field's own TYPE, through `DataViewSlots.Grouping` — the
sibling of `Cell` / `CellEditor` / `Filter` / `ValueCodec` / `ColumnConfig`, and
the same shape: a plain `defineSlot` payload keyed by `match` (the type token),
resolved per type honoring the `extends` chain.

```ts
DataViewSlots.Grouping({
  match: "date",
  label: "Group dates by",          // the granularity band's own section label
  groupings: dateGroupings,          // Smart, Day, Week, Month, Year
});
```

The primitive used to spell `type === "enum" || type === "bool"` in three
places — `isGroupableField`, a `sectionLabel` with an enum-options lookup and a
`bool → Yes/No` branch, and an "enum sections follow `field.options` order"
block inside `partitionIntoSections`. A date field could not group at all
(`String(aDate)` puts every row in its own section), and adding one would have
meant a fourth branch. Now enum, bool and date each contribute their own
groupings and the partition is pure mechanism.

### The contract (`core/internal/grouping.ts`)

```ts
interface FieldGrouping {
  id: string;                       // "smart" | "day" | "value" — persisted
  label: string;                    // "Smart", "Day", "Value"
  plan: (ctx: GroupingPlanContext) => (value: FieldValue) => GroupBucket | null;
}
interface GroupingPlanContext { now: number; values: readonly FieldValue[]; field: FieldDef<unknown> }
interface GroupBucket { key: string; label: string; order: number }
interface GroupByRule { fieldId: string; groupingId: string }
```

Three things about it are load-bearing:

- **`plan` is two-phase.** A grouping that must see the whole set before it can
  order its sections (enum by `options` index, the identity fallback by value
  order, a future range-derived "Auto") does that work once per render, not once
  per row.
- **`now` is injected, never read.** A grouping calling `Date.now()` would be
  untestable (the precedent is `relativeDayLabel(date, now)`) *and* incorrect
  here: the partition runs inside a `useMemo`, so a live clock would change the
  memo key every render. The host reads it once per surface via
  `useGroupingClock()` — local midnight, quantized, re-armed by ONE `setTimeout`
  at the next local midnight so a view left open overnight stops saying "Today".
  That timer is not the banned polling: it fires at the instant the value
  changes, which the calendar knows in advance, rather than waking to check.
- **`order` is a plain ascending ordinal**, read from whichever end the view's
  own sort on the grouped field points (`DataViewRenderProps.groupOrder`) — so
  `startsAt asc` reads Today → Tomorrow → Later and `startsAt desc` reads newest
  month first, out of one ordinal with no second config axis. The host derives
  it from **`activeState.sort`**, not the view's `state.sort`, which a
  server-delegated source zeroes out. The `None` bucket holds no position on the
  ordinal, so it stays **last in both directions**.

### There is exactly one "None", and a grouping cannot mint a second

A bucketer returns `GroupBucket | null`. **`null` means "not a value I can
bucket"** — a string in a date field that does not parse, an enum value of the
wrong shape — and the row joins the SAME section as a null value: one "None",
ordered last in both directions, owned by the partition.

A grouping must never build its own catch-all, and the type is what stops it.
The date grouping originally returned a `NO_DATE` bucket keyed `"none"` with
`order: Number.POSITIVE_INFINITY`, which fails twice: a second section also
labelled "None" appears beside the real one, and `Infinity - n` is `Infinity`, so
the catch-all pins last ascending and **first descending** — it jumps to the top
of the list the moment the view's sort flips. `null` has neither failure mode
available.

The ordinal is checked too: `order` must be **finite**, or the partition throws
naming the grouping and the bucket (once per bucket, not per row). Infinity is
only ever reached for as "put this at the end", which it does not do; that is
what `null` is for.

### Groupability is derived, not listed

`isGroupableField(field, hasGrouping)` is `field.groupable ?? hasGrouping(type)`
— a field is groupable because its type says how it buckets. `hasGrouping` comes
from `useGroupingRegistry().has`; the host resolves it once and publishes it on
the controls context, because a `Setting` contribution's `isApplicable` is a pure
function and cannot read a slot. Any field can still opt out with
`groupable: false`, or in with `groupable: true` — which then uses the fallback:

**The identity grouping** (`web/internal/identity-grouping.ts`,
`{ id: "value", label: "Value" }`) is what a type declaring no groupings falls
back to: one section per distinct value, `String(value)` for both key and label,
ordered by the value's index in the `compareValues`-sorted value list. It is also
what the legacy persisted `groupBy: "<fieldId>"` string migrates to —
`readGroupBy` coerces it to `{ fieldId, groupingId: "value" }`, which is exactly
what that string always meant. Migration is **on read and never destructive**;
the config row is re-serialized only when the user next edits group-by. No
committed `.jsonc` needs touching.

### The picker

`GroupByControl` renders the field radio band, then — only when the active
field's type offers more than one grouping — a **second `ControlPanel.Section`
labelled from the contribution's own `label`**. Two bands rather than a
`usePanelStack` push (the `add-sort-affordance.tsx` precedent): the choice is
small and closed, and seeing granularity next to field is the point. Picking a
field goes through `controller.setField`, which resolves the granularity itself
(keeping the current one when the new type still offers it, else that type's
first), so the persisted `groupingId` is never one the type does not have.

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
There is **no per-view header-inset axis**: `GroupedSections` owns `rail-follow`
on its `SectionHeaderRow`, so every group header sits on the one rail (see "The
rail" below) — no view passes a `headerClassName`.

**Why it is shared and not per-view.** Per-view JSX drifts (a view child silently
forgetting to pin its headers), and a lint rule can't state "a grouped section must
be wrapped in sticky chrome" — one shared branch makes the divergence
unrepresentable. See
`research/2026-07-17-data-view-gallery-sticky-group-headers.md`.

**`table` is the documented exception.** Its group headers are `col-span-full` rows
of `data-table`'s subgrid — chrome that owned a `<Stack>` would displace them out of
the grid and break column alignment — so it composes `StickyStack` directly inside
`data-table`, under the same policy and with `base` offset by its own sticky column
header. The tree renders through the shared chrome too, with one `TreeList` per
section: its ROOTS partition by the group-by field and every descendant follows
its root's section (see the tree child's CLAUDE.md "Group-by"). It is the one
view that calls `partitionIntoSections` directly rather than through
`useDataViewSections`, so it resolves the grouping registry itself.

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
host threads it to every flat view (`list`/`table`/`gallery`), each running it
through `useDataViewSections`. The aggregate step runs **after** group-by and
**after** the manual-order rank sort, **within each section**:

- entries sharing a non-null `getKey` collapse into ONE `DataViewRowEntry` with
  `row = pickRepresentative(members)`, `aggregateCount = members.length`, and
  `members` = every collapsed row, keeping the **position and `key` of the first
  member** (the entry stands for the group, not a single row);
- a `null` key passes the row through 1:1 (no `aggregateCount`);
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
collapse + representative selection + count badge.

## Create affordances (`creators`)

Pass `creators?: CreateOption[]` to `<DataView>` — typed "make a new row" actions,
the flat-view counterpart to the tree-only parent-scoped `HierarchyConfig.onCreate`.
`CreateOption` is domain-pure (`{ id, label, icon?, description?, onSelect }`;
`onSelect` may be async), exported from both the core and web barrels.

The host renders them in the toolbar immediately before the view switcher (a
private `CreatorsControl`, **not** barrel-exported): 0 → nothing; 1 → a labelled
`Button`; N → a `+` `IconButton` opening a dropdown of icon + label (+ muted
`description` sub-line) items. `CreatorsControl` owns a single shared **busy**
flag — each click `await`s `onSelect` in a `try/finally`, disabling the control
while pending, so no consumer hand-rolls a per-call-site `useState`. The creators
are also threaded into `DataViewRenderProps.creators` so views can opt into their
own create UI (the gallery's trailing "+" card + empty-state CTA).

## Toolbar controls

Every affordance in the toolbar that opens a panel — Filter, Sort, the view
settings — is a **`DataViewSlots.Control` contribution**. The toolbar names none
of them.

It used to name all three, as `sortControl` / `filterControl` / `fieldsControl`
ReactNode props built by the host: the collection-consumer rule broken in the most
literal way, and the reason no plugin could add a fourth control. Now the toolbar
reads the slot, drops the contributions whose `isApplicable` says no, sorts by
`order`, and builds one identical trigger per survivor.

```ts
DataViewSlots.Control({
  id: "data-view.filter",
  label: "Filter",              // tooltip + accessible name, compact-fold row
  icon: MdFilterList,           // label, and a pushed sub-panel's back title
  order: 0,
  size: "builder",              // the panel's WIDTH ROLE — menu | builder
  isApplicable: (ctx) => ctx.filter.filterableFields.length > 0,
  summary: (ctx) => summarizeFilter(…),   // pure; see below
  component: FilterControlPanel,           // prop-less; reads useDataViewControls()
});
```

### `defineSlot` + `renderIsolated`, not `defineRenderSlot`

The `View` / `Setting` precedent, for two reasons that are not stylistic:

- A render slot mounts **every** contribution. That would mount every control's
  panel on every DataView on every page — each running `useFilterPresets`, the
  live custom-values resource, and so on — merely to draw a **closed** trigger.
  With a plain slot the host reads metadata and mounts exactly the one panel that
  is open.
- A render slot is unconditionally reorderable, so it would owe an authored
  `config/primitives/data-view/primitives.data-view.control.jsonc` carrying a
  build-blocking `// @review` marker — for a fixed reading order that `order`
  already expresses. **This slot owes no config override.**

`DataViewSlots.Setting` survives unchanged, one level down: a *control* is a
toolbar affordance, a *setting* is a section inside one control's panel. Flattening
the two would put Properties / Group by / Fields in competition for the toolbar's
single line.

### One merged context

`useDataViewControls()` (`web/components/controls/controls-context.tsx`) is what
both a control's panel and a `Setting` contribution read — there is one context,
not a "controls" one and a "settings" one, because the settings menu *is* a
control. Everything on it is computed once in `DataViewBodyInner` and merely
re-homed; nothing is derived here. In particular `filter` and `sort` are the same
controller objects the row pipeline uses, so a summary and what actually filters
cannot come from two computations.

It is provided around **the toolbar only**, never around the view body: view
children have a deliberate contract (`DataViewRenderProps`), and an ambient back
door to `viewModel` would be a second undocumented seam. Popovers portal out of
the DOM but stay React children, so the context still reaches every panel.

### The trigger is icon-only, everywhere

`ControlTrigger` draws a ghost `IconButton`, `secondary` while the control is
narrowing what you see. No summary text on the button, no `+N` badge, and **no
width-dependent form** — a trigger that spelled itself out when wide and shrank to
a glyph when narrow is the per-surface inconsistency this registry exists to
remove. (Summary pills were tried and reverted: two of them ate the whole toolbar
of the agent-manager sidebar, the app's narrowest DataView.)

### The summary is pure, one function — and TEXT, never chrome

A control's closed state still says what it is doing via `summary(ctx)` → one
`DataViewControlSummary` (`label`, optional `spoken` for a glyph-leaning label,
`more`, `count`) or `null`, spent where it costs the toolbar no pixels:

- the trigger's **tooltip** — `Filter: Status is none of 2 +1` (the glyph form);
- the trigger's **accessible name** — `spoken ?? label`, "+N more" spelled out
  (a bare number beside a phrase is ambiguous with no visual context);
- the **compact fold's** control rows, as trailing text — a row each to spend;
- `count` → the fold's aggregate badge on `MdTune`.

**It cannot be a hook.** The trigger has to render without mounting the panel;
computing N summaries by mounting N panels would make every DataView subscribe to
every control's data on first paint. So `summarize-filter.ts` / `summarize-sort.ts`
are plain functions over state, unit-tested next to their source.

**It is one function returning an object, not `summary` + `count`.** Two
independent functions over the same state can disagree — precisely the bug
`rule-resolution.ts` exists to close (the summary reading "0 rules" while a
value-less `bool` rule silently filtered). The summarizers import `isRuleActive`
and the dangling-rule filter rather than re-deriving them, so the summary, the
count and the evaluator ask one question.

Value formatting tries the operator's own optional
`FilterOperator.summarize(operand, field)` first — the operand's shape is the
operator's, so only `date · is between` knows it holds a pair of instants — then
falls back generically, omitting an operand it has no readable form for.

Settings deliberately carries **no** summary: view settings are configuration, not
a narrowing of what you see. A summary answers "what am I not seeing, and why";
"Group by: Status" answers neither, and it would still count itself into the
compact fold's badge as though something were hidden. Sort sits between the two:
it earns a summary, because its top level is worth reading from a closed
trigger.

### Panel bodies

A control's `component` is **prop-less** and reads the context, which is what lets
the wide bar and the compact fold mount it through the same
`DataViewControlPanel({ control })` host with nothing left to diverge on. Panels
are drawn with the `control-panel` vocabulary
(`@plugins/primitives/plugins/css/plugins/control-panel/web`) — the panel body
never paints its own surface or picks its own width; `size` is a role
(`menu` | `builder`) and there is no third option.

One capability was traded away: a `Control`'s `isApplicable` is pure and cannot
read another slot, so the settings control can no longer self-hide when no
`Setting` applies. It is always applicable and renders `ControlPanel.Empty` in
that case. In practice nothing changes — custom-columns' "Fields" setting declares
no `isApplicable`, so the gear was already always visible.

**A `Setting` contribution renders its own `ControlPanel.Section`** — a contract,
not a convention. The panel body lays its *bands* out itself, so a contribution
that returned loose rows has no band and no rule, and one that wrapped itself in a
`div` makes that opaque box the band instead of the sections inside it. (The host
therefore maps contributions in through a `Fragment`, never a wrapper — see
`control-panel`'s CLAUDE.md for why `display: contents` matters here.) For the same reason a setting owns
a section and never the panel's `Footer`: Properties' "Show all fields" is its
section's last ROW, because a footer placed from inside one section would sit above
whatever contribution came next.

**A sub-panel is a push, never a second popover.** `usePanelStack()` reaches the
stack the host mounted — the filter builder's nested groups, "Save as preset",
custom-columns' per-field editor and the compact fold's per-control pages are all
pages of the one panel. Note what that costs: a stack entry's `render` closure is
captured when the row is clicked and the pushed page REPLACES the root's subtree,
so a page must read its own state through hooks (`useDataViewControls()`,
`useFilterEditor()`, its own config hook) rather than taking it as a prop. Handing
data down through the closure looks fine and then silently computes the page's
second edit against the tree as it was before its first.

## An option carries its own presentation

`FieldDef.options` is `FieldOption[]` = `{ value, label, variant?, hint? }`
(core barrel). One idea — **an option describes how it presents** — rather than a
value→label map plus a parallel value→variant map that every render site has to
join by hand (six such pairs were hand-written across Events, trace and timeline
before this existed).

- `variant` is a `BadgeVariant` (`primitives/css/badge/core`), applied by the
  read chip; absent ⇒ `"muted"`.
- `hint` is the chip's tooltip — why this value means what it means ("Empty" =
  the run succeeded and found nothing).

`BadgeVariant` lives in **`badge/core`** for exactly this reason: a data
declaration in another plugin's `core` has to be able to spell it, and
`core → web` is not a legal edge. The `VARIANT_CLASS` map stays in `badge/web`,
which re-exports the type so no existing import site changed. Duplicating the
union into `data-view/core` was the alternative and is rejected — one name per
concept.

**Deliberate no-ops.** The inline editors and the filter operand input draw
`ToggleChip`s (`enum-editor`, `tags-editor`, `chip-select-filter-input`) and stay
untinted: `BadgeVariant` is not `ToggleChip`'s vocabulary. Group-by section
labels and the control summaries are text-only. Server-side filter SQL never
reads `label`/`options`, so a tint never reaches the server. User-authored custom
enum columns get **no colour picker** — muted is the right default for values
with no semantics.

### The Cell registry also says whether a type presents as a chip

`DataViewSlots.Cell` contributions carry `chip?: boolean` alongside `component`
(see `CellContributionMeta` in `web/cell-slot.ts`); `enum` and `tags` declare
`chip: true`. `useIsChipField()` is `useResolveCell`'s sibling — both walk the
same `extends` chain through one shared internal lookup, so "which contribution
owns this field" cannot be answered two ways.

It exists because ` · ` is punctuation between two pieces of **text**, and is not
what separates two chips, which already carry their own boundary. The list's
subtitle run therefore draws ` · ` **only between two adjacent non-chip terms**
and parts a chip from its neighbour by spacing alone — otherwise a row of three
enum fields renders `name · [Web page] · [Daily] · [Failed]`, middots glued to
pills, which is worse than the two-line row a field-driven row replaces. The rule
covers the title→first-subtitle-term seam too, since on one line the title is
simply the run's first term.

The list names **no** field type to do this: it asks the registry, per the
collection-consumer rule. The flag is a claim about the field's **TYPE**, not
about one renderer — a consumer's `FieldDef.cell` override on a chip-typed field
is taken to render a chip too (which is how Events keeps its "source type no
longer installed" fallback). An override that renders plain text for a chip-typed
field loses its middots; cosmetic, and the price of not making every consumer
re-declare what its type already said.

## Row activation is PER ROW

`onRowActivate?: (row) => void` says every row activates. `rowActivation?: (row)
=> (() => void) | null` says which ones do — the handler's **presence** is the
fact, so there is no predicate beside it to disagree with. Passing both throws.

The host folds either into ONE `DataViewRenderProps.rowActivation: (row) =>
(() => void) | undefined`, so a view never sees the two.

**A view must pass that result straight to its row element's `onClick` —
`undefined` and all, never wrapped in a closure.** `Row` infers its element from
`onClick` (`row.tsx`), and a closure is never null, so wrapping makes every row a
`<button>` with the `renderRow` children nested inside it: invalid DOM for any
control a row body holds, the outer row eating the press, and a list where
nothing activates announcing every row as a button. Locked by
`list/web/__tests__/row-activation.test.tsx`, which asserts the DOM shape — the
handler fired correctly the whole time this was broken.

`DataCard` follows the same rule (no `role`/`tabIndex`/key handler without
`onActivate`). **The table is table-level**, not per-row: `DataTable.onRowClick`
is a table-wide prop with consumers outside data-view, so a non-activating row
there is a live-looking row that does nothing rather than a plain container.
Lifting that means changing `DataTable`.

## Row tone: a row can read as inactive

`DataViewProps.rowTone` is `(row) => "default" | "muted"`. `"muted"` dims the
row's own title, so a switched-off / archived / finished row reads inactive
without spending a chip on saying so — the thing three plugins hand-rolled
before it existed (`SourceRow` muting a disabled source, `ConversationItem`
muting `gone`/`done`, `ThreadRow` bolding unread).

**It threads like `searchAccessor`, not like `density`.** `density` is a
declaration *about the surface*, so it takes the chrome path. `rowTone` is a
**data accessor** closed over row identity, the same shape as `searchAccessor` /
`onRowActivate` / `hierarchy`, so it flows straight through with no chrome hop:

```
DataViewProps.rowTone
  → DataViewSourceBundle          (Omit<DataViewProps, …chrome keys> — free)
    → DataViewBodyProps
      → DataViewRenderProps.rowTone   the view child tones its own title
```

Concretely: `body-types.ts`, `data-view.tsx` and `merged-data-view.tsx` need no
change at all, because the bundle is derived from `DataViewProps` and the hosts
spread it. The only code is the type declarations, one destructure-and-forward in
`DataViewBodyInner` beside `searchAccessor`, and the barrel exports.

Views never re-spell what `"muted"` looks like: `rowToneClass(tone)` (web barrel)
is the ONE rendering, returning a class only for the non-default tone so each
view composes it on top of whatever colour its own title already carries.

| View | Where |
|---|---|
| list | the title `<Text>`, in both the one-line and the stacked shape |
| gallery | the card title `<Text>` |
| tree | folded into `labelClass`, ahead of `options.labelClassName` so the consumer's own per-row class still wins |
| table | **deliberate no-op** |

The table is a no-op the way gallery/table are no-ops for `density` — stated, not
forgotten. Its only per-row seam is `DataTableProps.useRowDecoration`, a single
slot already held by manual-order drag decoration; merging two decorations onto
one hook is its own change, not a side effect of this one.

The tree's `labelClassName` / `rowAccent` stay as the escape hatch. `rowTone` is
the semantic form to reach for first — a tone is a statement about the row, a
class is a statement about pixels.

## Density: how much room the surface gives the view

`DataViewProps.density` is `"comfortable"` (the default) or `"compact"`. It is a
**declaration by the surface**, and it threads through exactly one path, so both
hosts get it from one place:

```
DataViewProps.density  (and MergedDataViewProps.density)
  → DataViewShellFrame prop
    → DataViewShellChrome.density        (web/internal/body-types.ts)
      → DataViewBody
        ├→ DataViewToolbar               the fold rule, below
        └→ DataViewRenderProps.density   the view child tightens itself
```

`DataViewSourceBundle` **omits** `density` alongside `title`/`actions`: it
describes the surface, not the data, so a source contribution cannot spell a
value the body would then ignore.

Only the **list** child honours it today — `size = options.size ?? (density ===
"compact" ? "sm" : "md")`. Table and gallery ignoring it is a deliberate no-op,
not an omission: their row shapes are governed by `data-table`'s own density and
the card grid's cell width, so there is nothing a compact surface would ask them
to drop.

### The fold rule

```ts
const compact = density === "compact" || (width > 0 && width < COMPACT_BREAKPOINT);
```

The two halves are OR-ed, never substituted. The **measurement** half is
involuntary: below `COMPACT_BREAKPOINT` (360px) the wide inline row (search + the
control triggers + the switcher) does not fit, and no declaration makes it fit.
The **density** half is voluntary: a 672px popover has the room and still wants
the light form. So density removes the *need* for room; it never asserts there is
any. A compact surface that also happens to be narrow is still compact, and a
comfortable surface that is genuinely too narrow still folds — the single reason
a surface cannot end up wide *and* folded by accident.

### The compact trigger is hover-revealed

The **toolbar row** carries `hoverRevealGroup` and `CompactControls`' trigger
carries `hoverRevealTarget` (`primitives/hover-reveal/web`) — the **CSS-group**
half of the primitive, never `useHoverReveal()`. The state hook would re-render
the whole DataView, every windowed row included, on each pointer enter/leave of
the surface; the class pair is pure CSS and costs nothing.

The group sits on the **bar**, not the DataView root. The root looks like the
friendlier target (the compact bar is mostly empty) and is wrong: it makes every
pass over the list a reveal, so grazing a row flickers a control in the far top
corner, unrelated to what the user was doing. The trigger answers where it lives.

Two conditions suspend the reveal:

```ts
const alwaysVisible = open || searching;
```

- `searching` — the search field holds a query.
- `open` — its own panel is up. The panel is portaled, so the pointer leaves the
  hover group the instant it moves into it; without this the trigger would fade
  out from under the panel it opened.

**Only the query pins it — filter, sort and group-by do not.** This is the
durable/transient split from "State split" above, applied to visibility. Filter,
sort and group-by are *durable narrowings*: they live on the view instance's
config row, authored and persisted and git-promotable, and they are part of what
that named view **is**. A view called "Failed builds" is not a list hiding things
from you; it is that list, and it has nothing to confess. Pinning its trigger
open forever reports the view's own definition back as though it were an
accident.

The query is the other half: an *ad-hoc gesture*, typed and forgotten, which is
exactly why it lives in per-tab `sessionStorage` rather than the config row. Fold
the bar away and it leaves no other trace on screen, so the narrowed list reads
as the view's whole contents. The trigger is what the user follows back to it.

Two earlier attempts got this wrong and are worth naming, because both look
reasonable. The first pinned on `activeCount > 0`, which counts every control's
summary — and since surfaces author a default sort in config (the Build popover's
Recent view authors `startedAt ↓`), the trigger never hid at all. The second
added a `hidesRows` flag to `DataViewControlSummary` so a control could declare
it was withholding rows; the filter set it, the sort did not. That flag is now
**gone**: once a filter stopped pinning the trigger, nothing set it, and a
contract field with no implementer is speculative generality. The signal is the
query the toolbar already holds, passed to `CompactControls` as `searching`.

The badge is unaffected and still counts filter and sort — "N things configured"
is a different and correct statement, and `activeCount` still picks the filled
`secondary` button form over the ghost one. Only *visibility at rest* asks the
narrower question.

This is **one fold with one behaviour**: it applies wherever the compact form
appears, including today's width-folded narrow surfaces — the conversations
sidebar's options button is hover-revealed too. Two visually different compact
bars whose difference nothing in the UI explains would be the alternative.

**The bar stays in flow.** Compact is a thin strip holding the view tabs (shown
only when there is more than one instance) with the hidden trigger at its end; it
reserves its height even when it looks empty and never paints over row content.

### Single-line list rows are the default

`ListViewOptions.lines` is `1` (default) or `2`. At `1` the title and the subtitle
are **sibling truncating leaves of the row's own line** — `Row` composes `Line`,
so the `region-line` + `SingleLineProvider` contract is already there and each
`<Text>` ellipsizes without asking — with an empty `<Fill>` absorbing the slack
before the rigid trailing cell (`align: "end"` fields + the `×N` aggregate badge).
The subtitle's `·` join simply extends to the seam with the title, which on one
line is the run's first term. At `2` the subtitle stacks under the title in a
`Stack`, which resets the single-line context, so each `<Text>` asks for its own
`truncate` — the shape every list had before, unchanged for the surfaces whose
subtitle is prose rather than chips.

What gives first when the line is tight: both leaves shrink at CSS's default
factor, weighted by content width, so the longer one yields more — and the
subtitle, being the `·`-joined metadata run, normally is the longer one. That is
the intent (the title identifies the row) without a shrink-priority primitive
invented for one call site.

**Blast radius is small**: every high-traffic list surface (the conversations
sidebar, mail threads, the events list, deploy history) overrides the row body
wholesale through `viewOptions.list.renderRow` and is untouched. What changes is
the field-driven default.

## Per-item actions

Per-row actions (delete, expand-all, …) are a **cross-view** concern: contribute
an action once, every view renders it in its natural trailing affordance (tree-row
hover-trailing, table-row hover-trailing column, gallery-card top-right hover).

The mechanism is the **`defineItemActions<TRow>(id)` factory** (web barrel),
mirroring the `detail-sections` / `tabbed-view` factory precedent — **not** a
global slot like `View`. `View` is global because views are a *fixed shared
vocabulary* with one render-props contract; item actions are the factory case
because each consumer's row type is disjoint (`Block`, `TaskListItem`, `Agent`).
A global slot would force `ComponentType<ItemActionProps<unknown>>` and a runtime
`kind` discriminator to keep one app's Delete off another app's rows;
per-consumer slots are isolated by construction and keep full `TRow` typing.

Each consumer calls `defineItemActions<Row>("<stable-id>")` once. The result is
**callable for contributions** (`MyActions({ id, component })`, like any
`defineRenderSlot`) and carries `.Row` — the `ItemActionsDescriptor`. Pass it to
`<DataView itemActions={MyActions} />`; the host threads it (plus a derived
`hasChildren` predicate from `hierarchy.getParentId`) into every view, which
renders it in its own affordance. Each action component receives
`ItemActionProps<Row>` (`{ row, hasChildren }`).

### The zone axis: does this action live at rest?

A contribution declares `zone?: ItemActionZone` — `"revealed"` (default, the
hover cluster) or `"persistent"` (painted at rest where the view has a permanent
per-row region). It is a property of the **action**, declared once, so every view
gives the same answer — as opposed to per-view config, which lets an author
promote Play on the card and forget the table row.

Views never branch on zones themselves: they call the ONE shared rule,
`useItemActionZones(itemActions, { hasPersistentSlot })` (web barrel), once per
render and apply the returned `persistent` / `revealed` render functions per row.
`hasPersistentSlot` is **required**, so a new view type must answer it.

| View | `hasPersistentSlot` | Persistent placement |
|---|---|---|
| gallery | `true` | `DataCard.footer` → `<RowActions pin={null} alwaysVisible>` |
| table | `true` | the reserved trailing `auto` track, before the revealed cluster |
| list | `false` | — demoted to the hover cluster |
| tree | `false` | — demoted to the hover cluster |

`false` demotes, **never drops** — a view with no permanent region is still the
only place that action can appear. List/tree say `false` on purpose: a reserved
trailing region would take width from the title in the app's narrowest surfaces
(the Pages sidebar), and no consumer needs one today. It is a one-flag change
when a surface earns it, so `primitives/css/row` and `primitives/tree` stay
untouched.

**`primitives/action-presentation` is a different axis — do not merge them.** It
answers *what form does this action draw as* (ghost icon button vs labelled menu
row); `zone` answers *is the cluster painted at rest*. They compose.

## Field extensions

**There is no second per-row render slot — a per-row datum is a `FieldDef`.** The
field schema is the generic seam (it also buys sort, filter and a table column),
so a private "extra meta" slot beside it is always a duplicate.

`FieldDef.value` is a *synchronous* `(row) => FieldValue` and cannot call hooks, so
a field whose projection must close over **hook-loaded data** owned by another
plugin (e.g. a play-count living in another plugin's live resource) has to be
produced from inside a mounted component.

**One contribution shape.** A field-extension contribution is a **component** (not
a plain `FieldDef[]`) typed `ComponentType<FieldExtensionProps<TRow>>`, where

```ts
interface FieldExtensionProps<TRow> {
  storageKey: DataViewId;                              // which surface
  rowKey: (row: TRow, index: number) => string;        // how to identify a row
  render: (fields: FieldDef<TRow>[]) => ReactNode;      // hand the host the fields
}
```

The registration carries one more thing — **`section: string | null`**, the band
its fields are listed under (see "Field sections" below).

Every contributor receives the **surface coordinates** (`storageKey`, `rowKey`) so
a cross-cutting contributor can key its per-row data over the surface; one that
doesn't need them just ignores them:

```tsx
function PlaybackFields({ render }: FieldExtensionProps<Song>) {
  const map = usePlaybackHistoryMap();
  const fields = useMemo<FieldDef<Song>[]>(() => [
    { id: "playCount", label: "Plays", type: "int",
      value: (s) => map.get(s.id)?.playCount ?? 0, sortable: true },
  ], [map]);
  return <>{render(fields)}</>;  // ignores storageKey/rowKey — it keys off its own resource
}
MyFields({ id: "playback", section: null, component: PlaybackFields });
```

**Two registration entry points, one mechanism.** A field extension reaches the
host through exactly one of two places — the difference is only the **registration
site** (and, consequently, the row typing):

1. **The always-on global `DataViewSlots.FieldExtension` slot** — the
   **cross-cutting** case: a single slot **every** DataView folds, for a
   contributor that augments *all* surfaces (custom-columns' user-defined columns).
   It is literally `defineFieldExtensions<unknown>("primitives.data-view.field-extension")`
   — the same factory minted once at `<unknown>` (a global slot spans disjoint
   consumer row types, so `rowKey` is `(row: unknown, …) => string`). A cross-plugin
   contributor imports the slot and contributes itself (`custom-columns →
   data-view`, the legal parent-ward edge), so the host names **no** individual
   contributor.
2. **The per-consumer `defineFieldExtensions<TRow>(id)` factory** (web barrel), the
   sibling of `defineItemActions` — the **typed/scoped** case (disjoint row types
   per consumer → a factory, per the same collection-vs-factory rule). Each
   consumer calls it once with a stable id; the result is **callable for
   contributions** (`MyFields({ id, component })`, like any `defineRenderSlot`) and
   — being a slot — is itself the `FieldExtensionsDescriptor` the host reads (no
   extra `.Row`-style member, unlike item-actions). Pass it to
   `<DataView fieldExtensions={MyFields} />` (Sonata's play-count / last-played
   fields). Full `TRow` typing.

**One fold over an ordered source list.** `CollectFieldExtensions` (internal) folds
`[DataViewSlots.FieldExtension, ...(props.fieldExtensions ? [props.fieldExtensions] : [])]`,
threading `{ storageKey, rowKey }` to every contributor — each mounts
error-boundary-isolated (`renderIsolated`), runs its own hooks, yields its
`FieldDef[]`, and recurses; the base case calls `children([...base, ...allExtra])`.
Both the source-level and contribution-level folds are recursive **components**,
never a `.map` over contributed hooks (which `react-hooks/rules-of-hooks` rejects).
The fold wraps the model **before** the sort/filter controllers, so a contributed
`int`/`date` field shows up in the Sort control, the Filter control, and the table
columns for free. It runs at `<unknown>` (the global slot spans disjoint consumer
row types), so `props.fields`/`rowKey` and the merged result cross a safe
`FieldDef<unknown>`↔`FieldDef<TRow>` cast at the top-level `DataView` boundary; the
global slot being a `defineRenderSlot`, its fold order is a committed reorder
override (`config/primitives/data-view/primitives.data-view.field-extension.jsonc`).

**Intentional asymmetry vs `RowOrder`.** There is deliberately no
`GlobalFieldExtensionProps` (a field extension is one shape whether registered
globally or per-consumer) while the sibling `GlobalRowOrderProps` remains:
`FieldExtension` had **two** cases to unify (global custom-columns + per-consumer
Sonata); `RowOrder` has only the global one (`view-order`), so there is nothing to
symmetrize. Do **not** "restore symmetry" by re-splitting `FieldExtension` or by
minting a per-consumer `RowOrder` factory that has no consumer. See
["The global `RowOrder` slot"](#the-global-roworder-slot-cross-plugin) under
Manual order.

### Field sections: a band per contributor

A schema several plugins contributed to is a flat list of forty columns unless
something says where each came from. `FieldDef.section` is that: the heading a
field is listed under in **every** "choose a field" surface — the filter and sort
typeahead, the Properties list, the group-by band. The host's own fields sit
first under `SHARED_FIELD_SECTION` ("Common"); each contributor's follow under
its own name, so the merged run surface reads `Common / Build / Backup / Release
/ Deploy` everywhere instead of one undifferentiated list.

**A contributor never authors it per field.** `FieldExtensionContribution.section`
is declared once on the registration and the fold **stamps** it over every field
that contributor returned (`sectioned()` in `field-extensions.tsx`), so a plugin
cannot spell its own band two ways across forty columns, forget it on the
fortieth, or file a column under another plugin's name. Authoring
`FieldDef.section` by hand is for a HOST splitting its own base schema into
bands.

It is **required and nullable**, not optional: `null` says "these are ordinary
fields of the host's own schema" (one `Starred` boolean on the pages sidebar,
`Category` on tasks) and is a real answer, distinct from an arm that merely
forgot — which, defaulted, would file its columns under the host's own name with
nothing to catch it.

Three rules fall out of it, all in one place each:

- **Headings appear only when there is something to tell apart.** `FieldSections`
  (`web/internal/field-sections.tsx`) is the one component every surface draws its
  field list through; with a single section it draws no heading at all, so a
  plain one-plugin schema keeps the flat list it always had. The heading is
  `ControlPanel.Subhead` — the panel vocabulary's own member, so it follows the
  panel's label rails and typography instead of being hand-rolled here; carrying
  no rail class of its own is what also makes it right in the one surface with no
  panel around it (`field-picker.tsx`'s bare `InlinePopover`), where it lands on
  that region's own content edge.
- **The typeahead matches the band's name too** (`fieldSearchText`), so typing
  "deploy" in the filter picker offers the deploy arm's eight columns whatever
  they are individually called.
- **The band order IS the body order.** `orderFieldsBySection` (core) is applied
  by both `resolveBodyFields` and the Properties controller's item list, and
  Properties draws one `SortableList` per band — so a drag reorders within its
  own source, and a column can never sit between two bands in the table while
  the list that ordered it shows it inside one. The cost is deliberate: columns
  from two sources cannot be interleaved.

## Collection-consumer separation

Consumers import **only** `DataView` + the core types from this umbrella and select
views by **type** id (`views={["gallery", "table"]}` — `DataViewContribution.type`
ids, not instance ids). They **never** import a view child. Adding a view type is a
new child plugin with zero consumer changes.

## Adding a new view child

1. Create `plugins/primitives/plugins/data-view/plugins/<view>/`.
2. In its `web/index.ts`, contribute one entry to the slot:
   `DataViewSlots.View({ type: "<view>", title, icon, order?, hierarchical?, component })`.
   The `type` is the view-type's registry id (what consumers list in
   `views={[…]}`).
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

Per-field filtering is driven by `FieldDef.type`: the Filter control's panel
writes a `FilterGroup` tree to `state.filter`, and every view evaluates it through
the shared `evaluateNode` / `applyFilter` evaluator (resolved per field type via
`useResolveOperatorSet`). Flat views apply it inside `useFlatRows` (search → filter
→ sort); the tree view applies it subtree-preserving before handing rows to the tree
primitive. Filter semantics are therefore identical across all views.

**Filter presets** are the twin of the sort presets: a named, reusable
`FilterGroup` saved in the sibling `filterPresets` key of the same per-surface
config doc (via the `presetsExtraFields` seam injected into the views descriptor —
view-core never names it). The filter panel hosts the saved presets in its top
section (apply = write the preset's group verbatim into the live filter) plus a
`Save as preset` footer row, exactly like sort. Both are drawn by the shared
`web/components/presets/` pieces. Deleting is the row's own hover-revealed trash
(`ControlPanel.Row`'s `actions` slot, which makes the click target a sibling of
the button rather than its ancestor); because a lost filter tree cannot be
reconstructed, the delete raises a toast whose Undo restores the preset at its
original index. Hook:
`useFilterPresets(storageKey)`; readers `readFilterPresets` /
`filterPresetMatchesGroup` live next to the sort readers. A preset's group is
stored opaquely as a `jsonField<FilterGroup>` (validated whole through
`FilterGroupSchema` on read), git-promotable like every config row.

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
*not* a generic `ViewTypeMeta` key — view-core never knows about sort) exists for a
view type with no meaningful field-sort axis: the Sort control's `isApplicable`
then drops it while the Filter control stays. Flag omitted = honors sort.

Body rendering is **show-all by default**, governed per view-instance by
`visibleFields` (below) and *not* tied to `primary` — so a field is visible in the
body **and** usable in the filter builder unless a surface explicitly hides it. To
keep a field **filter-only**, author a narrow `visibleFields` on that view that
omits it (and set
`filterable: false` to also keep it out of the full-text search accessor) — as the
settings config nav does (`visibleFields: ["label"]` in
`config/config_v2/settings/config_v2.settings.nav.jsonc`, keeping its `modified` /
`conflict` / `source` fields as pure filter dimensions), and as the studio explorer
and code-explorer file trees do with `visibleFields: ["name"]`.

## Per-view visible fields (Properties)

Which fields a view renders in its **body**, and in what order, is a per-view-instance
dimension — the visible-fields twin of `sort` / `filter`, stored in the **same `view`
blob** as `visibleFields?: string[] | null`:

- **`null` / absent (the default)** → the **schema's own default body set**: every
  field in schema order except those declaring `FieldDef.visible: false` (below).
  Newly added fields (including a freshly added custom column) auto-appear with zero
  user action.
- **explicit `string[]`** → exactly those field ids, in that order; everything else is
  hidden. Order is meaningful — it is the body order (table columns, gallery/list
  property rows, tree secondary chips). Like Notion, once a view is customized,
  later-added fields stay hidden until toggled on.

### `FieldDef.visible` — a field can be a dimension without being printed

`visible?: boolean` (default `true`) is the **schema's** half of the same
question: `false` means the field feeds sort / filter / group-by / search only
and is not in the default body set — the user can still switch it on from
Properties. It is what a surface reaches for instead of authoring a narrow
`visibleFields` array purely to omit one field.

**Two places hardcoded "show everything", and both read it** — this is the part
that is easy to half-do:

- `web/internal/resolve-body-fields.ts` — the unconfigured branch now filters
  `f.visible !== false`. Without this the flag does nothing at all.
- `web/internal/use-visible-fields-controller.ts` — the unconfigured branch seeds
  each item's checkbox from `field.visible !== false` rather than a literal
  `true`. Without *this* the field renders **checked** in the Properties list
  while the body leaves it out, and the first click on that checkbox visibly does
  nothing.

Sort / filter / search are unaffected by construction, not by care: every view
runs `useDataViewSections` over the full `props.fields` and calls
`resolveBodyFields` afterwards, on a separate value.

**The one semantic to accept.** In a view whose config already holds an explicit
`visibleFields` array, a `visible: false` field is indistinguishable from "a field
the user never switched on" — the array simply does not mention it. That is the
existing, intended Notion-parity behaviour, and it means `visible` is a
**default, not an enforcement**. For the same reason "Show all fields" resets to
`null`, i.e. back to the schema default — a `visible: false` field returns to
unchecked rather than appearing.

Custom columns need nothing: they are folded into `props.fields` before any view
calls `resolveBodyFields`, and an absent `visible` reads as `true`.

`visibleFields` governs **body rendering only**. Filter, sort, and search always
operate on the **full** `FieldDef[]` schema — a hidden field stays filterable and
sortable. The shared `resolveBodyFields(fields, visibleFields)` helper maps the blob
to the ordered visible subset each view renders; the primary/title slot in
gallery/list/tree is then `pickPrimaryField` over that **visible** subset (so a hidden
title falls back to the next visible text field).

Users edit this from the **View settings** control (`MdTune`) — the
**"Properties"** entry in its "Current view" section, a `view`-scope `DataViewSlots.Setting` contribution
(`PropertiesControl`) sitting alongside "Group by": a sortable, checkbox list to
reorder / hide fields, plus a "Show all fields" reset (back to `null`). The setting
gates itself to surfaces with more than one field (via the contribution's
`isApplicable`, which the menu reads generically — it never names Properties). Writes
go to the view's config row exactly like sort/filter (`updateView(id, { visibleFields }, { merge: true })`),
so the choice is durable and git-promotable. Surfaces wanting a deliberately narrow
body author `visibleFields` directly in their committed `.jsonc` — see the
config-nav example under "Filtering".

## The rail (the inverted topology)

Every horizontal band the DataView owns — toolbar, view bodies, group headers,
table rows, loading skeletons — applies `rail-follow`
(`padding-inline: var(--rail-start, var(--chrome-pad-x))`). Vertical rhythm stays
on the named spacing ramp.

**The DataView container itself never pads — its bands do.** That is the inverse
of the rail contract's normal shape (container pads, children inherit) and it is
deliberate: flipping it means `PaneChrome` becoming a region owner, which would
inset every pane in the app including the deliberately full-bleed ones. The two
consequences you must hold in mind:

- A host that insets a DataView itself **opens a region** — `rail-<step>`, which
  pads and publishes in one declaration, and so sets `--rail-owed-*` to zero: the
  owner paid, followers owe nothing. (`detail-sections`' `Host`, `SectionCard`'s
  body, task-detail's tasks pane.) Never `Inset` + a rail class on one box:
  `Inset` pads without publishing, so the pair would announce a rail that
  disagrees with the padding actually applied.
- A host wanting a **different** rail publishes `--rail-start`/`--rail-end`
  *without* padding — the app-shell sidebar does, at `--space-sm`, which is why a
  sidebar DataView's chrome lands on the sidebar's pill rail. Here the follower
  still owes the rail, and pays it.

See `research/2026-08-17-global-inset-ownership-rail-contract-v2.md`.

## Placement: always natural-height, never owns a scroll

`<DataView>` has **no placement mode** — it is **always natural-height** and
**never owns a scroller**. The root is a plain block box (`<Stack gap="none">` =
`flex flex-col`, *no* `min-h-0 flex-1`), so the body grows to its natural content
height and the **enclosing pane owns exactly one scroll**, provided by
`<PaneScroll>` (`@plugins/primitives/plugins/pane/web`). The single-scroll model
removes the whole class of nested/severed-scroll bugs.

- **The toolbar is a `<Sticky edge="top" mask>` header.** The `<Stack gap="none">`
  root is each DataView's own sticky **containing block**, so stacked DataViews
  hand off automatically — when a section scrolls out its toolbar un-pins with it,
  no `active` toggling or computed `top` offsets. The `mask` prop paints
  `bg-chrome-mask` so rows never show through the pinned bar, following the surface
  the DataView is embedded in (page canvas, sidebar, `<Surface>`).
- **The pane provides the scroll.** `PaneChrome` routes its body through
  `<PaneScroll>`, so a DataView rendered as `PaneChrome` children scrolls for free;
  a non-pane host must supply its own `<PaneScroll>` (or equivalent `overflow-y`
  scroller) around the DataView.

**Dev-mode structural guards.** On mount `<DataView>` runs two loud-but-non-fatal
checks (`console.error`, never throw — safe for overlay/SSR edges), after one
layout frame (`use-dev-guards.ts`):

1. **Single-scroll.** Walks up for the nearest ancestor the content vertically
   overflows; if that ancestor clips (`overflow-y ∉ {auto, scroll, overlay}`) the
   pane forgot its `<PaneScroll>` and the view is unscrollable.
2. **Chrome-mask match.** The sticky toolbar masks with `--chrome-mask`, which
   must equal the actual painted background behind the DataView. Every `<Surface>`
   (and the page canvas / sidebar / theme scope) co-publishes `--chrome-mask`
   alongside its background, so this holds by construction for surfaces built
   through the primitive. The guard compares the root's computed `--chrome-mask`
   against the nearest actually-painted ancestor background — catching an **ad-hoc**
   `bg-muted`/`bg-card` wrapper that paints a surface without co-publishing (a lint
   can't see it: the surface is a runtime ancestor). Fix: route the wrapper through
   `<Surface>`.

The toolbar, filter bar, and view switcher always render — there is no
headless-chrome axis.

## Row virtualization (`VirtualRows`)

Large views window their rows through the shared `<VirtualRows>` component, which
lives in its **own leaf primitive** (`primitives/virtual-rows`) — not the data-view
barrel — so both `data-view/list` and the `primitives/tree` primitive (which
`data-view/tree` builds on) can consume it without a layering inversion. It wraps
`@tanstack/react-virtual` with dynamic row measurement (variable heights) behind a
small API: `items`, `estimateSize`, `getKey`, `itemClassName?`, `overscan?`,
`scrollToIndex?` (`align: "auto"`, for host-driven selection reveal), plus a
`children(item, index)` row renderer.

**It self-discovers the scroll container** — `findScrollParent` walks up to the
nearest ancestor whose `overflow-y` is `auto`/`scroll`/`overlay` (fallback: the
document scroller), then measures `scrollMargin` (the list's offset within that
scroller) so windowing is correct even when a sticky toolbar / tab strip sits above
the list. Deliberately *not* a threaded-in ref: since the DataView never owns its
own scroll, windowing binds to the pane's single `<PaneScroll>` (or any outer
scroller the host provides), and the sticky toolbar's height folds into the
measured `scrollMargin` automatically.

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
    - `DataViewSlots.Control` ← `primitives.data-view`
    - `DataViewSlots.Cell` ← `fields.bool.table`, `fields.color.table`, `fields.date.table`, `fields.enum.table`, `fields.image.table`, `fields.number.table`, `fields.tags.table`, `fields.text.table`
    - `DataViewSlots.CellEditor` ← `fields.bool.inline`, `fields.date.inline`, `fields.enum.inline`, `fields.number.inline`, `fields.tags.inline`, `fields.text.inline`
    - `DataViewSlots.Filter` ← `fields.bool.filter`, `fields.date.filter`, `fields.enum.filter`, `fields.number.filter`, `fields.tags.filter`, `fields.text.filter`
    - `DataViewSlots.ValueCodec` ← `fields.bool.data-view-codec`, `fields.date.data-view-codec`, `fields.number.data-view-codec`
    - `DataViewSlots.Grouping` ← `fields.bool.data-view-group`, `fields.date.data-view-group`, `fields.enum.data-view-group`
    - `DataViewSlots.ColumnConfig` ← `fields.enum.column-config`
  - Contributes:
    - `ConfigV2.WebRegister` ×40: "agent-launches", "agents-list", "all-conversations", "code-explorer.file-tree", "config_v2.settings.nav", "conversations-sidebar", "debug.boot-profiles", "debug.config-orphans", "debug.profiling.runtime", "debug.reports", "debug.slow-ops.cluster-aggregate", "debug.slow-ops.cluster-timeline", "debug.slow-ops.local", "debug.trace.events", "deploy.deployment.history", "deploy.deployments", "deploy.servers", "events.list", "events.run-events", "events.source-runs", "events.sources", "home.apps", "mail-threads", "page.links.backlinks", "pages-sidebar", "plugin-view.file-tree", "prototypes.gallery", "runs", "sonata.library", "story.gallery", "studio.compositions", "studio.compositions.closure-tree", "studio.explorer.tree", "studio.release.history", "task-deps-tree", "tasks-list", "tweakcn.community-browser", "tweakcn.quick-theme", "workflows.definitions", "workflows.executions"
    - `DataViewSlots.Setting` "data-view.properties" → `PropertiesControl`
    - `DataViewSlots.Setting` "data-view.group-by" → `GroupByControl`
    - `DataViewSlots.Control` "Filter" → `FilterControlPanel`
    - `DataViewSlots.Control` "Sort" → `SortControlPanel`
    - `DataViewSlots.Control` "View settings" → `SettingsControlPanel`
  - Uses:
    - `config_v2.useConfig`
    - `config_v2.useSetConfig`
    - `fields.Fields`
    - `primitives/collapsible.CollapsibleContent`
    - `primitives/collapsible.CollapsibleProvider`
    - `primitives/css/control-panel.ControlPanel`
    - `primitives/css/control-panel.ControlPanelPopover`
    - `primitives/css/control-panel.usePanelStack`
    - `primitives/css/inline.Inline`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/row.Row`
    - `primitives/css/row.SectionHeaderRow`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Stack`
    - `primitives/css/sticky.Sticky`
    - `primitives/css/sticky/stack.StickyStack`
    - `primitives/css/sticky/stack.StickyStackItem`
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
    - `primitives/hover-reveal.hoverRevealGroup`
    - `primitives/hover-reveal.hoverRevealTarget`
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
    - `shell/toast.showToast`
  - Exports (types):
    - `CellContributionMeta`
    - `CellEditorProps`
    - `ColumnConfigDerive`
    - `ColumnConfigProps`
    - `CreateOption`
    - `DataViewAggregateConfig`
    - `DataViewContribution`
    - `DataViewControlContribution`
    - `DataViewControlsContextValue`
    - `DataViewControlSummary`
    - `DataViewDensity`
    - `DataViewId`
    - `DataViewProps`
    - `DataViewRenderProps`
    - `DataViewRowEntry`
    - `DataViewSection`
    - `DataViewSettingContribution`
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
    - `FieldGrouping`
    - `FieldGroupingSet`
    - `FieldOption`
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
    - `GroupBucket`
    - `GroupByController`
    - `GroupByRule`
    - `GroupedSectionsProps`
    - `GroupingPlanContext`
    - `GroupingRegistry`
    - `HierarchyConfig`
    - `ItemActionContribution`
    - `ItemActionProps`
    - `ItemActions`
    - `ItemActionsDescriptor`
    - `ItemActionZone`
    - `ManualOrderConfig`
    - `MergedDataViewProps`
    - `PartitionOptions`
    - `RowTone`
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
    - `IDENTITY_GROUPING`
    - `IDENTITY_GROUPING_SET`
    - `isFilterGroup`
    - `isGroupableField`
    - `makeSortComparator`
    - `MergedDataView`
    - `partitionIntoSections`
    - `pickPrimaryField`
    - `resolveBodyFields`
    - `rowToneClass`
    - `useDataViewControls`
    - `useDataViewSections`
    - `useFieldIdentities`
    - `useFilterController`
    - `useFlatRows`
    - `useGroupByController`
    - `useGroupingClock`
    - `useGroupingRegistry`
    - `useIsChipField`
    - `useItemActionZones`
    - `useResolveCell`
    - `useResolveCellEditor`
    - `useResolveColumnConfig`
    - `useResolveColumnDerive`
    - `useResolveGroupings`
    - `useResolveOperatorSet`
    - `useResolveValueCodec`
    - `useServerDataSource`
    - `useSortController`
- Server:
  - Contributes: `ConfigV2.Register` ×40: "agent-launches", "agents-list", "all-conversations", "code-explorer.file-tree", "config_v2.settings.nav", "conversations-sidebar", "debug.boot-profiles", "debug.config-orphans", "debug.profiling.runtime", "debug.reports", "debug.slow-ops.cluster-aggregate", "debug.slow-ops.cluster-timeline", "debug.slow-ops.local", "debug.trace.events", "deploy.deployment.history", "deploy.deployments", "deploy.servers", "events.list", "events.run-events", "events.source-runs", "events.sources", "home.apps", "mail-threads", "page.links.backlinks", "pages-sidebar", "plugin-view.file-tree", "prototypes.gallery", "runs", "sonata.library", "story.gallery", "studio.compositions", "studio.compositions.closure-tree", "studio.explorer.tree", "studio.release.history", "task-deps-tree", "tasks-list", "tweakcn.community-browser", "tweakcn.quick-theme", "workflows.definitions", "workflows.executions"
  - Uses:
    - `config_v2.getConfig`
    - `primitives/data-view/view-core.buildViewConfigRegistrations`
    - `primitives/data-view/view-core.viewsDescriptor`
  - Exports (values): `readDataViewConfigDoc`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deploy-history`
    - `apps/deploy/deployments`
    - `apps/deploy/servers`
    - `apps/events/event-list`
    - `apps/events/sources`
    - `apps/events/sources/source-detail/runs`
    - `apps/events/sources/source-detail/runs/extracted-events`
    - `apps/home/app-cards`
    - `apps/mail/threads`
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
    - `fields/bool/data-view-group`
    - `fields/bool/filter`
    - `fields/bool/inline`
    - `fields/bool/table`
    - `fields/color/table`
    - `fields/date/data-view-codec`
    - `fields/date/data-view-group`
    - `fields/date/filter`
    - `fields/date/inline`
    - `fields/date/table`
    - `fields/enum/column-config`
    - `fields/enum/data-view-group`
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
    - `plugin-meta/plugin-view/file-tree`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/gallery`
    - `primitives/data-view/list`
    - `primitives/data-view/server-query`
    - `primitives/data-view/table`
    - `primitives/data-view/tree`
    - `primitives/data-view/view-order`
    - `release`
    - `runs`
    - `tasks/task-deps-tree`
    - `tasks/task-list`
    - `ui/tweakcn/community-browser`
- Core:
  - Exports (types):
    - `CellEditorProps`
    - `ColumnConfigDerive`
    - `ColumnConfigProps`
    - `CreateOption`
    - `DataViewAggregateConfig`
    - `DataViewDensity`
    - `DataViewId`
    - `DataViewProps`
    - `DataViewRenderProps`
    - `DataViewRowEntry`
    - `DataViewSection`
    - `FieldDef`
    - `FieldExtensionProps`
    - `FieldExtensionsDescriptor`
    - `FieldGrouping`
    - `FieldGroupingSet`
    - `FieldOption`
    - `FieldSchemaSection`
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
    - `GroupBucket`
    - `GroupByRule`
    - `GroupingPlanContext`
    - `HierarchyConfig`
    - `ItemActionProps`
    - `ItemActionsDescriptor`
    - `ItemActionZone`
    - `ManualOrderConfig`
    - `RowTone`
    - `SelectionConfig`
    - `ServerDataSourceSpec`
    - `ServerPage`
    - `SortPreset`
    - `SortRule`
    - `TableCellProps`
    - `ValueCodec`
    - `ViewState`
  - Exports (values):
    - `compareValues`
    - `DATA_VIEW_HEADER_OFFSET_VAR`
    - `defineDataView`
    - `FilterGroupSchema`
    - `FilterNodeSchema`
    - `FilterRuleSchema`
    - `IDENTITY_CODEC`
    - `orderFieldsBySection`
    - `SHARED_FIELD_SECTION`
    - `splitFieldSections`
- Sub-plugins:
  - **`custom-columns`** — User-defined custom columns for any DataView: the config-backed definition controller, the per-row values live hook + upsert mutation, and the toolbar settings (Fields) button. Persists per-row custom-column values keyed by (dataViewId, rowKey, columnId): a generic DB table, a push live resource, and an upsert/delete-on-empty endpoint.
  - **`gallery`** — Gallery view child for the data-view primitive: a responsive card grid with a field-driven default card plus a composable DataCard chrome.
  - **`list`** — List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.
  - **`server-query`** — Generic FilterGroup → SQL compiler for server-delegated data-view sources, plus the DataViewServer.QueryAugmentor registry (server twin of the web FieldExtension slot) that lets sub-plugins inject extra joined sort/filter columns. Field-type agnostic: operator SQL is supplied by an injected resolver, so this owns drizzle and the filter compilation, not any field type. The field-agnostic keyset seek + cursor codec now live in primitives/keyset.
  - **`table`** — Table view for data-view: maps the typed field schema to data-table columns with host-controlled sort.
  - **`tree`** — Tree view child for the data-view primitive: adapts the shared field schema + hierarchy config onto the tree primitive (buildTree, TreeList, RowChrome, RenameInput).
  - **`union-query`** — Keyset-paginated UNION ALL compiler for server-delegated DataViews: merges N heterogeneous tables into one ordered row space. Owns the three things that are hard to get right and entirely field-agnostic — arm pruning, aligned typed-NULL projections, and pushing the compiled WHERE / keyset seek / LIMIT into each arm before the union. Composes server-query's compileWhere and primitives/keyset's seek; imports no field type.
  - **`view-core`** — Type-agnostic named-view-instance engine: instance model + resolver, config-descriptor machinery, debounced write-back, and the editable view-switcher chrome. Type-agnostic named-view-instance engine (server): the per-id `views` config descriptor + a generic registration helper. Consumers register their own ids under their own plugin.
  - **`view-order`** — Per-view-instance manual row order for any DataView: subscribes to the persisted (dataViewId, viewId) ranks, synthesizes a total order, and contributes the resulting ManualOrderConfig back through data-view's global RowOrder slot. Persists a per-view-instance manual row order keyed by (dataViewId, viewId, rowKey): a generic DB table, a push live resource, and a validating upsert endpoint that writes only the drag's bounded set (the moved row plus the seeds now ahead of it) rank-ascending — O(gesture), never a full replace, nothing deleted.

<!-- AUTOGENERATED:END -->
