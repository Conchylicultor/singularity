# Page editor: side-margin click should focus the block (no dead zone)

## Context

In the Pages app the block content is a centered narrow reading measure
(`READING_MEASURE = "mx-auto w-full max-w-4xl px-lg"`, wrapped by `contentRef`)
rendered inside a **full-width** interaction `Overlay` (`containerRef`). On a wide
pane this leaves a large empty band to the left and right of the column.

Clicking that side-margin **level with an existing block** does nothing — "the
click has no effect." Notion's model is *no dead zone: every (x, y) in the editor
maps to a caret position*; the block at a given row owns its whole horizontal
band, and the X only picks which line edge to snap to.

The recent `Frame`→flex rewrite already fixed clicks **inside** the column (the
editable is `min-w-0 flex-1`, so the browser places the caret natively) and the
**above-first / below-last** zones already insert/append. The one remaining dead
zone is the side-margin-beside-a-block case, which falls through
`onEmptyClick` to a bare `clearSelection()`.

This plan routes that branch to the nearest block at the line edge nearest the
click, reusing the focus machinery that already exists — no new geometry
primitive, no new per-block handle method.

## Root cause (single point)

`plugins/page/plugins/editor/web/components/block-editor.tsx`, `onEmptyClick`
(lines 490–518). After the empty-page / above-first / below-last branches
`return`, a click whose `y` is within `[firstBlock.top, lastBlock.bottom]` — i.e.
the side-margin beside a block — falls through to `clearSelection()` (line 515).
That clears any selection but never focuses a block or places a caret.

The only caller is `onUp` (line 557–559), which passes just `y`; the click `x`
is available at `onPointerDown` (`e.clientX`) but is not currently stored.

## Design

Replace the dead `clearSelection()` branch with: resolve the row at the click Y
(`rowAtPointer`, already returns the nearest block, never null unless the page is
empty), compute a `start`/`end` edge from the click X versus the content column,
and route the caret to that block's boundary via a new context method that reuses
the **existing** `focusBoundary` handle (registered by all text block types).

Key decisions:

- **Thread `x` through `marqueeStartRef`.** That ref is the one piece of state
  carried from `pointerdown` to the `pointerup` that calls `onEmptyClick`. Widen
  it `{ id, y }` → `{ id, x, y }` and the callback to `onEmptyClick(x, y)`. No
  other path needs `x`.
- **Edge rule = column center.** Because `onPointerDown` bails on
  `.closest("[data-block-id]")` and every row lives inside the `max-w-4xl`
  `contentRef` column, any click reaching this branch is horizontally *outside*
  the column. Compare X to the column center (robust, degrades to `start` if the
  rect is momentarily null):
  ```ts
  const rect = contentRef.current?.getBoundingClientRect();
  const edge: "start" | "end" =
    rect && x >= rect.left + rect.width / 2 ? "end" : "start";
  ```
- **Caret mechanism = reuse `focusBoundary` (block start/end).** For single-line
  blocks — the dominant case and the exact reported scenario — block-end ==
  line-end, so this is pixel-identical to Notion. A line-precise variant (a new
  `placeCaretAtPoint(editor, x, y, edge)` geometry primitive + a new
  `focusAtPoint` handle method wired into every registration site) would only
  improve *mid-paragraph margin clicks beside multi-line blocks* — a rare edge
  case — at real surface-area cost. Skip it. The call-site contract ("route to
  block + edge intent") leaves the door open to swap in a point-precise handle
  later without touching `onEmptyClick`. (`focusAtColumn` is **not** a fit — it
  ignores the click Y and snaps to the top/bottom visual line, for arrow-key
  column preservation.)
- **Handle-less / non-text blocks → select the block.** Text blocks have the full
  handle (`focusBoundary`); `divider`/`equation` have `focus`-only (fall back to
  `focus()`); image/code-block/file/embed/video/audio/bookmark/page-link register
  **no** handle. For those, the caller selects the block via `applyRange(id, id)`.
  Today such a click does nothing, so highlighting the block you clicked beside is
  a strict improvement and matches Notion's block-selection feel. The new method
  is **synchronous and returns whether a handle was found** — it must NOT use
  `focusBlock`'s `pendingFocusRef` deferral, which would silently no-op for
  never-registering blocks (the target is already on screen, found via live DOM).

## Changes

### 1. `plugins/page/plugins/editor/web/block-editor-context.tsx`

Add a sibling to `focusBlock` (after line 246):
```ts
const focusBlockBoundary = useCallback(
  (id: string, edge: "start" | "end"): boolean => {
    const handle = focusHandlesRef.current.get(id);
    if (!handle) return false;
    if (handle.focusBoundary) handle.focusBoundary(edge);
    else handle.focus();
    return true;
  },
  [],
);
```
- Interface `BlockEditorContextValue` (near line 118, beside `focusBlock`):
  `focusBlockBoundary: (id: string, edge: "start" | "end") => boolean;`
- Add `focusBlockBoundary` to the provider value object (after line 635) and to
  the `useMemo` deps array (after line 660), mirroring `focusBlock`.

### 2. `plugins/page/plugins/editor/web/components/block-editor.tsx`

- Destructure the new method from `useBlockEditor()` (the `focusBlock` destructure
  around lines 198–207): add `focusBlockBoundary`.
- Widen `marqueeStartRef` (line 481):
  `useRef<{ id: string | null; x: number; y: number } | null>(null)`.
- Change `onEmptyClick` signature (line 490–491) to `(x: number, y: number)` and
  replace the trailing `clearSelection();` (line 515) with:
  ```ts
  const row = rowAtPointer(y);
  if (row) {
    const rect = contentRef.current?.getBoundingClientRect();
    const edge: "start" | "end" =
      rect && x >= rect.left + rect.width / 2 ? "end" : "start";
    if (!focusBlockBoundary(row.id, edge)) applyRange(row.id, row.id);
    return;
  }
  clearSelection(); // only when the page has zero blocks
  ```
  Update the deps array (line 517) to add `applyRange` and `focusBlockBoundary`
  (`contentRef` is a ref — no dep needed).
- In `onPointerDown`, record X at start (line 534):
  `marqueeStartRef.current = { id: start?.id ?? null, x: e.clientX, y: e.clientY };`
- In `onUp` (lines 557–559), pass both coords:
  ```ts
  if (!marqueeMovedRef.current) {
    const s = marqueeStartRef.current;
    if (s) onEmptyClick(s.x, s.y);
  }
  ```

No edits to `caret-geometry.ts`, `block-text-editor.tsx`, or any block renderer —
`focusBoundary` is already registered everywhere it can be.

## Regressions / edge cases

- **"Click margin to deselect" still works.** With a multi-block selection, the
  new path focuses a block; `onFocusCapture` (lines 829–832) auto-clears block
  selection on focus — so it still clears, now also landing a caret. For
  handle-less rows, `applyRange(id, id)` replaces the selection with that one
  block (reasonable — you clicked beside it).
- **Gap-between-stacked-rows clicks** now focus the nearest row instead of
  clearing, because `rowAtPointer` returns the nearest row by vertical distance.
  This is the intended "no dead zone" behavior but is a change beyond the pure
  side-margin case — note it in review.
- **Above-first / below-last branches untouched** — they `return` before the
  middle branch; insert/append behavior is preserved exactly.
- **Multi-line block, mid-paragraph margin click** snaps to the block's first/last
  line edge (boundary), not the adjacent line — accepted limitation.
- **Marquee drag unaffected** — `onEmptyClick` only fires when
  `!marqueeMovedRef.current` (>3px vertical threshold unchanged).

## Verification

1. `./singularity build`, open `http://<worktree>.localhost:9000/pages/page/<id>`.
2. Manual via `e2e/screenshot.mjs` (drive + assert in page context):
   - Click the **right** margin level with a single-line text block → assert
     `document.activeElement` is that block's contenteditable and
     `window.getSelection()` is collapsed at the text **end**.
   - Click the **left** margin → collapsed at **offset 0** (start).
   - Click beside an **image** row → that image block becomes selected
     (highlighted), nothing focused.
   - Click **below the last** block and **above the first** → unchanged
     (append / focus-first).
   - Drag (>3px) from the margin → still a marquee selection, no caret.
3. No unit test: the logic is driven entirely by live `getBoundingClientRect()`
   (jsdom returns zeroed rects, no layout, no rect harness in repo). The
   center-comparison arithmetic is the only pure seam and is not worth a test in
   isolation; rely on the Playwright check.

## Critical files

- `plugins/page/plugins/editor/web/components/block-editor.tsx` — edit
- `plugins/page/plugins/editor/web/block-editor-context.tsx` — edit
- `plugins/page/plugins/editor/web/components/block-text-editor.tsx` — reference (confirms `focusBoundary` registered)
- `plugins/page/plugins/editor/web/internal/caret-geometry.ts` — reference (`placeCaretAtBoundary`)
- `e2e/screenshot.mjs` — verification harness
