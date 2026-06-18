# Tree-view row virtualization

## Context

The data-view **list** view now windows large lists via the shared
`<VirtualRows>` component (`research/2026-06-18-data-view-row-virtualization.md`),
but the **tree** view still renders the full hierarchy. The tree renders via
recursive component nesting — the `primitives/tree` `TreeList` maps root nodes to
`RowChrome`, which recurses into each expanded node's `children` — with `@dnd-kit`
drag-and-drop. There is no flattened visible-node list to window. The Tasks tree
tab (~3000 tasks, fully expanded) renders every node synchronously.

## Obstacle: the recursion lives in the tree primitive

`VirtualRows` lives in `data-view`, but the recursive render lives in
`primitives/tree` (`TreeList` + `RowChrome`). The data-view tree *adapter* only
supplies `rows` + a `Row` renderer to `TreeList`; it cannot intercept the
rendering. So windowing must happen **inside `TreeList`** — which means the tree
primitive needs `VirtualRows`.

`primitives/tree` cannot import from `data-view`: `data-view/tree` already imports
`primitives/tree`, so a `tree → data-view` edge inverts the layering (a low-level
primitive depending on a composite that contains tree-consuming children) and
risks a cycle.

## Approach

### 1. Extract `VirtualRows` into its own leaf primitive

New `plugins/primitives/plugins/virtual-rows/web/`. Both `data-view/list` and
`primitives/tree` (and the future table/gallery follow-ups) consume it. This is
the clean structural fix — a generic windowing primitive shared without a layering
inversion — and the natural home the original research doc already anticipated.

- Move `data-view/web/components/virtual-rows.tsx` → the new primitive.
- Move the `@tanstack/react-virtual` dep from `data-view/package.json` to the new
  primitive's `package.json`.
- `data-view/list` imports `VirtualRows` from `@plugins/primitives/plugins/virtual-rows/web`.
- Drop the `VirtualRows`/`VirtualRowsProps` re-exports from the data-view barrel
  (a cross-plugin re-export is forbidden anyway once the source moves out).
- New optional prop **`scrollToIndex?: number | null`**: an effect calls
  `virtualizer.scrollToIndex(i, { align: "auto" })` when it changes — lets a host
  keep a programmatically-selected off-screen row visible (the windowed
  replacement for the in-DOM `scrollIntoView` in `use-tree-row`).

### 2. Window `TreeList` in the tree primitive

- Build one `flatVisible: { node, depth }[]` DFS memo (descending into a node's
  children only when `expanded`); derive the existing `orderedIds` from it (no
  behavior change to multi-select).
- `const windowed = flatVisible.length > VIRTUALIZE_THRESHOLD` (100, mirroring
  the list view). Below the threshold the **exact current recursive render**
  runs — small trees byte-for-byte unchanged (drop indicators, accent overlays,
  no absolute-positioning/observer overhead).
- Windowed: render `flatVisible` through `<VirtualRows>`; each item renders
  `<Row node={item.node} depth={item.depth} />`. Indentation is padding-based
  (`paddingLeft: depth * indentStep`), not DOM nesting, so a flat list of
  siblings is visually identical to the nested render.
- Add a `windowed` flag to `TreeListContext`. In windowed mode `RowChrome`
  **skips its child-recursion block** — the flat list already contains every
  visible descendant in order, so recursing would double-render.
- Selection scroll: pass `scrollToIndex` = the index of `selectedId` in
  `flatVisible` (only when windowed). `align: "auto"` makes it gentle (scrolls
  only when off-screen), matching the old `block: "nearest"`.
- `estimateSize` ≈ 32px (`min-h-7` row + `py-xs`); dynamic measurement refines it.

### 3. Tasks tree tab → `mode="embedded"`

Mirror the Recent-tab fix: the Tasks tree DataView mounts inside the
`defineTabbedView` host (a bounded `overflow-y-auto` block), so a surface-mode
data-view nests a second, unbounded scroller and `VirtualRows` would window
against ~140000px. `mode="embedded"` drops the data-view's own scroller so
`VirtualRows` discovers the tabbed-view scroller — one correctly-bounded scroll
owner.

## DnD in a windowed tree (caveat)

Each visible row still mounts `useDraggable` + 3 `useDroppable` zones, and
`computeDrop` works off the full flat `rows` array, so reorder/reparent is
unchanged for any drop whose source and target are both within the rendered
window (+overscan). The edge case: dragging a row far enough that the **source**
row scrolls out of the window unmounts its draggable mid-drag, which `@dnd-kit`
may treat as a cancel. This only applies once a tree exceeds 100 *visible*
(expanded) rows — typical drags are local. Documented as a follow-up
(sortable+virtual integration / keep-active-mounted) rather than over-engineered
here.

## Critical files

- `plugins/primitives/plugins/virtual-rows/` — new primitive (moved component + barrel + package.json)
- `plugins/primitives/plugins/data-view/web/index.ts` — drop VirtualRows re-export
- `plugins/primitives/plugins/data-view/package.json` — drop react-virtual dep
- `plugins/primitives/plugins/data-view/plugins/list/web/components/list-view.tsx` — import from new primitive
- `plugins/primitives/plugins/data-view/CLAUDE.md` — move the virtualization doc section
- `plugins/primitives/plugins/tree/web/internal/tree-list.tsx` — flatten + window
- `plugins/primitives/plugins/tree/web/internal/row-chrome.tsx` — skip recursion when windowed
- `plugins/primitives/plugins/tree/web/internal/use-tree-row.tsx` — context `windowed` flag
- `plugins/primitives/plugins/tree/package.json` — (no react-virtual; imports virtual-rows barrel)
- `plugins/tasks/plugins/task-list/plugins/tree/web/tasks-list.tsx` — `mode="embedded"`
```
