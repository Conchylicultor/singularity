# list

The **list** view child of the `data-view` primitive. Contributes one
`DataViewSlots.View("list")` entry: a compact, single-row-per-item dense list
rendered through the shared `FieldDef` schema. Suited to narrow master columns
where the chunky gallery cards and the wide multi-column table don't fit.

## What it renders

Each item is one `Row` (the `row` primitive), so the active-row affordance,
hover-revealed trailing actions, and leading icon slot all come for free:

- **leading slot** — `options.leading?.(row)` → `Row`'s `icon` slot (icon /
  avatar / status-dot).
- **selection** — `selected = rowKey(row) === selectedRowId` → `Row` maps it to
  `bg-accent` (the same highlight the tree view uses). Baked in from the start.
- **click** — `onRowActivate`.
- **item actions** — `<itemActions.Row row hasChildren />` in `Row`'s
  hover-revealed `actions` slot (matches gallery / tree).

### Field-driven body

The row body maps the `FieldDef` schema (shared `pickPrimaryField` heuristic):

- **primary field** → the title (`Text variant="label"`, truncating).
- fields with **`align: "end"`** → an always-visible trailing region inside the
  row body, right of the title/subtitle and **before** the hover actions
  (`field.cell(row) ?? String(field.value(row))`). This is where a status badge
  lands.
- **remaining non-primary fields** → the muted subtitle (`Text
  variant="caption"`, truncating), joined with `·`.

### One line by default (`options.lines`)

`lines: 1` (the default) puts the title and the subtitle **on the row's own
line**:

```
[icon]  Title · subtitle · fields                      trailing   [actions]
```

`Row` composes `Line`, so the row body is already a `region-line` +
`SingleLineProvider` context — the title and the subtitle are sibling truncating
leaves in it (each `<Text>` ellipsizes without asking), an empty `<Fill>` absorbs
the slack, and the trailing cell is a rigid leaf in its own track. The `·` join
extends to the seam with the title, which on one line is just the run's first
term.

When the line is tight both leaves shrink at CSS's default factor, weighted by
content width, so the longer one yields more — and the `·`-joined metadata run
normally is the longer one. That is the intent (the title identifies the row),
reached without a shrink-priority primitive invented for one call site.

`lines: 2` restores the stacked shape — subtitle under title inside a `Stack`,
which resets the single-line context so each `<Text>` asks for its own
`truncate`, with the trailing cell pushed by `ml-auto`. Reach for it when the
subtitle is **prose**, where the second line is genuinely a second thought,
rather than a run of short values.

Either way this is the list analog of the gallery's "title + muted properties":
primary = title, others = subtitle, `align: "end"` floats to the trailing edge.

**Which fields appear (and their order)** follows the view's per-instance
`visibleFields` (`resolveBodyFields` over the schema; **default `null` = all
fields**, schema order) — the same Properties dimension every view honors. The
title/subtitle/trailing split is unchanged: the primary (picked via
`pickPrimaryField` over the *visible* subset) is the label, `align: "end"` fields
trail, and the remaining visible fields form the subtitle. Hiding or reordering
fields via the toolbar "Properties" pill reshapes the subtitle/trailing accordingly;
filter and sort still use the full schema. See the data-view CLAUDE.md "Per-view
visible fields (Properties)" section.

When `options.renderRow` is set it owns the whole body instead, but is still
wrapped in the selectable/clickable `Row`.

## Grouping

Under group-by the grouped branch renders through the shared **`<GroupedSections>`**
chrome, which owns the `rail-follow` header inset and the
pinned/stacking group header for every flat view. The policy lives in the data-view
parent, not here; see its CLAUDE.md ("Grouped sections: one pipeline, one chrome").

## Windowing + manual order

`estimateSize` tracks both dimensions of the row's height — its `size` and its
`lines` — because a single-line row is roughly a caption-line shorter than the
stacked one; `VirtualRows` measures every mounted row anyway, so the estimate
only has to keep the sizer (and therefore the scrollbar) honest.

A section windows through `VirtualRows` once its entry count exceeds 100; below
that it renders as a plain `.map` inside a `<Stack className="rail-follow py-sm">`
(the ambient rail with a `py-sm` vertical rhythm). That single
threshold is the *only* windowing decision — manual order does not bypass it.

When the host hands down a `manualOrder`, both branches wrap each row in
`ManualOrderRow` (drag source + before/after drop indicators), and the whole view
is hosted by one `RankReorderProvider` spanning every section. The provider is
mounted with `measuringAlways` whenever **any** section windows, and its
render-prop `activeId` is threaded into each section's `VirtualRows` as
`keepMounted` — so the drag source survives scrolling out of its own window.
`VirtualRows` positions rows absolutely at their measured offsets, so a pinned
off-screen source is invisible and harmless.

A row whose `getRank` is `null` is non-orderable and renders plain, so
`useRankReorderItem` is never mounted for it — an element-type choice, not a
conditional hook.

## Options

`options` (= `viewOptions.list`) is a `ListViewOptions<TRow>`:

- `leading?(row)` — leading slot per row (icon / avatar / status-dot).
- `renderRow?(row)` — full row-body override (escape hatch); still wrapped in
  the selectable `Row`.
- `lines?` — rows per item, `1 | 2` (default `1`, one line — see above).
- `size?` — row density, `"sm" | "md"`. Default follows the SURFACE's
  `DataViewProps.density`: `"sm"` when it declared itself compact, `"md"`
  otherwise. Setting it here pins a density whatever the surface asked for.

## Exports

- `ListViewOptions` — the typed options interface. Consumers pass a plain
  `viewOptions={{ list: { … } }}` literal (never import this view child),
  mirroring the gallery / tree view children, which likewise ship only their
  options type.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: List view child for the data-view primitive: a compact single-row-per-item list (Row primitive) with field-driven label/subtitle/trailing, active-row highlight, and hover item actions.
- Web:
  - Contributes: `DataViewSlots.View` "List" → `ListView`
  - Uses:
    - `primitives/css/badge.Badge`
    - `primitives/css/center.Center`
    - `primitives/css/clip.clipClasses`
    - `primitives/css/fill.Fill`
    - `primitives/css/pin.Pin`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/row.Row`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.cn`
    - `primitives/data-view.DataViewAggregateConfig`
    - `primitives/data-view.DataViewRenderProps`
    - `primitives/data-view.DataViewRowEntry`
    - `primitives/data-view.DataViewSection`
    - `primitives/data-view.DataViewSlots`
    - `primitives/data-view.FieldCell`
    - `primitives/data-view.GroupedSections`
    - `primitives/data-view.ItemActionsDescriptor`
    - `primitives/data-view.ManualOrderConfig`
    - `primitives/data-view.pickPrimaryField`
    - `primitives/data-view.resolveBodyFields`
    - `primitives/data-view.useDataViewSections`
    - `primitives/data-view.useItemActionZones`
    - `primitives/data-view.useResolveCell`
    - `primitives/data-view.useResolveCellEditor`
    - `primitives/data-view.useResolveOperatorSet`
    - `primitives/rank-reorder.RankReorderProvider`
    - `primitives/rank-reorder.useRankReorderItem`
    - `primitives/virtual-rows.VirtualRows`
  - Exports (types): `ListViewOptions`
- Core:
  - Exports (types): `ListViewOptions`

<!-- AUTOGENERATED:END -->
