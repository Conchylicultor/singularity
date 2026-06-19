# Vision: Generic multi-level sort for data-view (Notion-style)

Status: **Vision only** — this doc frames the high-level goal and decomposition.
Detailed design + implementation are carried by the chained follow-up tasks.

> **Detailed design:** see
> [`research/2026-06-19-data-view-generic-sort-design.md`](./2026-06-19-data-view-generic-sort-design.md)
> — the implementation contract (data model + migration, comparator, controller,
> UI structure, table-view coherence) the chained tasks build against.

## Goal

Give the `data-view` primitive a generic, type-aware, **multi-level** sort builder
that mirrors Notion's sort UX and the data-view **filter** builder it already ships.
Today sort is a single `{ fieldId, direction }` cycled by clicking table-column
headers; there is no toolbar sort affordance and no way to express a secondary
tie-break. The screenshot we're mirroring shows: a `2 sorts` pill opening a popover
of reorderable rows — each row is `[drag handle] [field] [direction] [✕]` — with
`+ Add sort` and `🗑 Delete sort` footer actions.

Because every data surface in the app (tasks, gallery, list, tree, table, studio,
etc.) renders through `data-view`, this lands generic sort everywhere at once.

## Why mirror the filter builder

The filter builder is the proven template. It already solves the exact shape of
this problem: a toolbar **trigger pill** (ghost → secondary with an active count),
an `InlinePopover` body, per-rule rows built from a shared `Frame` with a
`FieldSearchList` typeahead field picker, hover-revealed remove actions, and
per-view persistence through `view-core`'s opaque `view` config blob. Sort is the
*simpler sibling*: no recursion, no AND/OR conjunction, no operator, no value
editor — just an ordered list of `{ field, direction }` rows. We copy the filter
folder's shape byte-for-byte and strip what sort doesn't need.

Reference (already present, do not re-invent):
- `plugins/primitives/plugins/data-view/web/components/filter/` — the UI template
- `web/internal/use-filter-controller.ts` — the controller pattern to mirror
- `web/internal/use-flat-rows.ts` — the search → filter → **sort** pipeline
- `web/internal/use-data-view-model.ts` — `setSort` / `sortFor` (single-sort today)
- `core/internal/types.ts` — `SortState`, `FieldDef.sortable`
- `plugins/view-core/` — per-view config persistence (`updateView(..., { merge })`)
- `plugins/fields/` — field identity registry (type, label, icon, `extends`, `coerce`)

## What changes (the vision, not the design)

1. **Data model: single sort → ordered rule list.** Generalize the persisted
   per-view `sort` from one `SortState` to an ordered `SortRule[]` (priority =
   list order). Keep it inside the same opaque `view` config blob so `view-core`
   stays untouched. Must include a backward-compatible read of the legacy single
   `sort` shape (migrate-on-read, never a destructive rewrite).

2. **Multi-level comparator.** The sort step in `useFlatRows` compares by rule 1,
   tie-breaks by rule 2, then rule 3… Direction (`asc`/`desc`) applies per rule.
   Comparison stays type-aware via the field's value projection / identity
   `coerce` (text→locale, number→numeric, date→chronological, bool→0/1), so adding
   a field type doesn't require touching sort.

3. **Sort builder UI** mirroring the filter folder:
   - `sort-builder-trigger.tsx` — toolbar pill, `N sorts` when active.
   - `sort-builder-popover.tsx` — flat reorderable list + footer (`Add sort`,
     `Delete sort`).
   - `sort-rule-row.tsx` — `Frame` row: drag handle + `FieldPicker` +
     direction picker (`Ascending`/`Descending`) + hover-revealed remove.
   - Reuse the existing `FieldSearchList` field typeahead and a `sortable`-aware
     field list (fields with a `value` projection and `sortable !== false`).
   - Reorder priority via the existing `sortable-list` primitive (drag handle as
     in the screenshot).

4. **Controller**: a `useSortController` analogous to `useFilterController`,
   exposing `rules`, `sortableFields`, and add/remove/move/setDirection/setField/
   clear actions, all committing through the per-view config write-back.

5. **Table-view coherence.** Clicking a column header today owns sort directly.
   With multi-sort, header-click should compose with the model (e.g. set/replace
   the primary rule, reflect the active primary in the header indicator) rather
   than fight it — define one source of truth.

## Non-goals (for now)

- Custom per-type direction labels (e.g. "A→Z" / "1→9" / "Newest first"). The
  generic `Ascending`/`Descending` is enough for v1; a later task can make the
  direction picker type-aware via the field identity.
- Manual/explicit drag-sort of rows themselves (that's the rank/reorder domain).
- Saving sorts as shareable presets beyond the existing per-view persistence.

## UX / polish bar

This is a load-bearing, app-wide primitive — it must feel professional: the pill
matches the filter pill's states exactly, empty-state copy guides the first sort,
drag reorder is smooth (reuse `sortable-list` displacement animation), direction
toggle is instant, and clearing returns to the ghost pill. Mirror the filter
builder's spacing, density (`control-sm`), and hover-reveal idioms so the two
toolbar controls read as a matched pair.

## Decomposition (chained follow-up tasks)

1. **Design** the generic multi-level sort (data model + migration + comparator +
   UI structure + table-view coherence) → detailed implementation plan.
2. **Implement** the sort data model, legacy-`sort` migration-on-read, the
   multi-level comparator in the pipeline, and the `useSortController`.
3. **Implement** the sort builder UI (trigger pill, popover, reorderable rule
   rows, direction picker) mirroring the filter builder folder.
4. **Reconcile** table-view column-header sort with the multi-sort model and do a
   final UX polish + verification pass across views.
