# collapsible-wrap

`CollapsibleWrap` wraps a horizontal "chip row" (a single slot `.Render`) to multiple
lines, clamped to `rows` rows by default, with a chevron toggle that reveals the rest.

## Why it exists (clip, don't drop)

This is the complement to `responsive-overflow`. `ResponsiveOverflow` *drops* (unmounts)
children that don't fit. `CollapsibleWrap` *clips* via CSS — every child stays mounted —
which is exactly what lets it compose with the global reorder edit mode: a clipped chip
is still a mounted, valid drag target. The inner `flex flex-wrap` box's **layout height is
always one clamp** — a computed `max-height` (uniform row height × `rows` + `gap` ×
(`rows`-1)) — in BOTH collapsed and expanded states. Only `overflow` flips: `hidden` when
collapsed (clips the extra rows), `visible` when expanded (reveals them). The row height is
a **global max** over all effective children (not just row 1), so the clamp stays stable
when a taller chip wraps to row 2.

## Row 1 never moves (in-flow spill, no portal)

The box stays **in normal flow** in both states and its layout height never changes — so the
host band's `items-center` centers exactly one row identically whether collapsed or expanded,
and **row 1 is pixel-stable**. Expanding doesn't relocate anything: it just stops clipping,
and rows 2+ spill DOWN over the content below.

For the spill to escape `PaneChrome`'s fixed-height band, the host must opt the band into
`overflow-visible` via **`<PaneChrome headerSpill>`** (default is `overflow-hidden`, clipped).
This is the deliberate, sanctioned home for "a header that can reveal overflow" — the chrome
owns the band, so the chrome grants the spill. The expanded box is lifted (`z-popover`) so the
spilled rows paint over the body. Because a `max-height`-clamped box's own background can't
paint overflowing content, a measured absolute **backdrop** (sized to the box's full
`scrollHeight`) draws the popover panel behind the spilled rows.

This replaces the earlier portal/`fixed`-overlay approach, which relocated the whole box into
`document.body` and so structurally moved row 1 between states. Keeping the box in flow makes
"row 1 doesn't move" true by construction rather than by pixel-chasing a frozen overlay rect.

## The single-`.Render` / single-`SortableContext` invariant

`children` is a single `ReactNode` — the one `<Slot.Render>` element — and is **never
indexed, mapped, or duplicated**. The global reorder middleware renders the slot's items
inside exactly one `SortableContext`. Rendering the slot twice (e.g. "row 1 here, rows 2+
in a popover") would create two `SortableContext`s and silently break drag-reorder — which
is *why* the whole box stays a single element that merely toggles its overflow.

## Force-expand on edit mode

`const editMode = useEditMode()` (from `@plugins/reorder/web`); `expanded = userExpanded ||
editMode`. While the global reorder pen is active everything is force-expanded so every chip
is a reachable drag target, and the chevron is hidden (a toggle would be a no-op).

Force-expand also injects a `ReorderLayout` (from `@plugins/reorder/web`) into the reorder
middleware via `ReorderLayoutContext.Provider` wrapped around `{children}` **inside** the
wrap box. The injected layout sets `strategy: rectSortingStrategy` — dnd-kit's 2-D strategy,
so chips drag correctly once they spill across wrapped rows. The **spacer is unchanged from
the 1-D case**: a reorder spacer is `flex-1`, which under `flex-wrap` grows to fill its line,
pushing following chips right until they wrap — exactly "push right while there's space, then
collapse". (An earlier revision wrongly swapped it for a `basis-full` line-break spacer.) When
no `CollapsibleWrap` is present the middleware sees a `null` context and falls back to today's
single-axis behavior byte-for-byte.

Overflow detection (`ResizeObserver` on the wrap box, deferred via `requestAnimationFrame`,
mirroring `responsive-overflow` — no timers, no polling) gates the chevron: it appears only
when `(overflowing || expanded) && !editMode`.

## Host contract

- The host must be a **flex row**. The inner box is `flex flex-wrap` (still
  `flex-direction: row`), so slot-render's per-contribution cell-wrapping (which keys off
  the parent's flex direction) keeps working.
- The host must give the expanded rows somewhere to spill: **no `overflow-hidden` ancestor**
  between the wrap box and where the rows should drop. In `PaneChrome` that means passing
  `headerSpill`. Without it, the expanded rows are clipped by the fixed-height band (the
  collapsed/edit affordances still work, but expanding reveals nothing below row 1).
- Under `flex-wrap`, slot-render wraps each chip in a `min-w-0` cell, which lets the *last*
  chip on a line shrink instead of wrapping — but only if its content is shrinkable
  (e.g. a `TruncatingText` title). Chips that must **not** shrink (badges, buttons) should
  set `shrink-0` on their contribution root so they wrap cleanly to the next line. Fix a
  squished chip there, not in `CollapsibleWrap`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Wraps overflowing children to multiple lines, clamped to N rows by default with a chevron toggle to reveal the rest. Force-expands while reorder edit mode is active.
- Web:
  - Uses: `primitives/css/surface.Surface`, `primitives/icon-button.IconButton`, `primitives/sortable-list.rectSortingStrategy`, `primitives/ui-kit.cn`, `reorder.ReorderLayout`, `reorder.ReorderLayoutContext`, `reorder.useEditMode`
  - Exports: Types: `CollapsibleWrapProps`; Values: `CollapsibleWrap`
- Cross-plugin:
  - Imported by: `conversations/conversation-view/header`

<!-- AUTOGENERATED:END -->
