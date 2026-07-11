# Page editor: caret landings are scroll-free by default; scroll is opt-in

## Problem

Clicking the left gutter/margin of a block jumps the page. Root cause: Lexical
couples "collapsed selection changed" with "scroll it into view".
`updateDOMSelection` (`lexical/Lexical.dev.mjs:8141`) runs
`scrollIntoViewIfNeeded` on every collapsed-selection reconcile where the root is
`document.activeElement`, **unless** the update carries the `skip-scroll-into-view`
tag. So Lexical's default is *scroll-on, opt-out*.

Our click path (`onEmptyClick` → `focusBlockBoundary` → `placeCaretAtBoundary`)
reuses the **same** caret-landing primitive as keyboard navigation, so it inherits
the scroll — and forces the caret to the block's *start*, which can be off-screen
even when the clicked spot was visible → the jump.

This coupling is correct for **keyboard-driven** caret motion (arrow off the edge
should follow) and wrong for **pointer-driven** placement (target is visible by
construction) and **programmatic non-navigation** selection changes.

## Design: invert the default for programmatic caret landings

**A programmatic caret landing never scrolls the viewport unless the trigger that
moved the caret explicitly opts in.** "Scroll" becomes an intent the trigger
declares, not a default the primitive imposes.

Scope note — this governs *only our programmatic landings* (the `caret-geometry.ts`
placement helpers + the block/selection `focus()` calls). **Native within-block
typing and single-arrow motion never pass through these helpers** (Lexical handles
them straight from DOM input events); their scroll-follow is correct and is left
untouched.

Two levers produce a no-scroll landing (both needed):
1. `editor.getRootElement()?.focus({ preventScroll: true })` — suppress the native
   focus-scroll (instead of `editor.focus()`).
2. `editor.update(fn, { tag: "skip-scroll-into-view" })` — suppress Lexical's
   selection-reconcile scroll.

For a scroll-wanted landing: `editor.focus()` + untagged update = today's behavior
(so no regression for the opt-in set).

## Threading the intent

New type in `caret-surface.ts`:

```ts
export interface CaretLandOptions {
  /** Follow the caret into view after landing. Default false. A pointer-driven
   *  placement lands where the user pointed (already visible); only keyboard
   *  cross-block nav, split/merge, undo/redo, and explicit jump-to-block scroll. */
  scroll?: boolean;
}
```

Widen the surface API (all optional `opts`, default `{ scroll: false }`):

```ts
export interface CaretSurface {
  focus: (opts?: CaretLandOptions) => void;
  focusBoundary?: (edge: "start" | "end", opts?: CaretLandOptions) => void;
  focusAtColumn?: (x: number, edge: "top" | "bottom", opts?: CaretLandOptions) => void;
}
// BlockFocusHandle: focusOffset?: (offset: number, opts?: CaretLandOptions) => void;
```

## Trigger classification (the "registered scroll events")

**scroll: true (opt-in)** — caret moves somewhere the user may not be looking:
- Keyboard cross-block nav — `block-editor-context.tsx` `navigate()` →
  `landCaret(surface, dir, caret, { scroll: true })`.
- Enter / split / insert / insertFirst — `focusNew()` → `handle.focus({ scroll: true })`.
- Backspace / merge join + undo/redo re-focus — `focusBlock(id, caretOffset,
  { scroll: true })` at the undo/redo thunks (`block-editor-context.tsx:579/583/635/640/709/713`).
- Content surgery (`appendRunsAtJoin`, split focus via `focusHydratingAware`) stays
  scrolling when driven by focusNew/merge (pass scroll through).

**scroll: false (default, no code at call site)** — caret goes where the user pointed,
or doesn't conceptually move:
- `onEmptyClick` gutter/margin/trailing paths (`block-editor.tsx:611/616/627`) — **the fix**.
- Trailing/leading-zone & empty-page focus of an existing block (`block-editor.tsx:341/348/352`).
- Selection-head focus on exit (`use-block-selection.ts:215`).
- Block-selection container focus (`use-block-selection.ts:106`, `block-editor.tsx:915`):
  plain DOM `focus({ preventScroll: true })`.
- indent/outdent re-focus (`block-editor-context.tsx:1101/1107`) — same block, visible.

## Files to change

1. `web/caret-surface.ts` — add `CaretLandOptions`; add `opts?` to the 3 methods.
2. `web/internal/caret-geometry.ts` — `placeCaretAtBoundary/Column/Offset` take
   `scroll = false`; preventScroll-focus + skip-tag update when `!scroll`, else today's path.
3. `web/internal/collab-text-surgery.ts` — `focusHydratingAware(editor, scroll)`:
   no-scroll path uses root `focus({preventScroll})` + a `skip-scroll-into-view`-tagged
   `selectStart()`; scroll path unchanged. (`appendRunsAtJoin` scroll param, default true.)
4. `web/internal/caret-landing.ts` — `landCaret(surface, dir, caret?, opts?)`, forward opts.
5. `web/block-editor-context.tsx` — `BlockFocusHandle.focusOffset` opts; thread opts through
   `focusBlock` / `focusBlockBoundary` / `focusNew`; `pendingFocusRef` carries
   `{ id, scroll }`; `navigate` passes `{scroll:true}`; undo/redo focus calls pass `{scroll:true}`.
6. `web/components/block-text-editor.tsx` — handle's `focus/focusBoundary/focusAtColumn/focusOffset`
   forward `opts` (and `opts.scroll`) into the geometry/surgery functions.
7. `web/internal/use-block-selection.ts` — `focusContainer` → `focus({ preventScroll: true })`.
8. `web/components/block-editor.tsx` — `containerRef.current?.focus({ preventScroll: true })`.

## Verification

- No regression: keyboard ArrowUp/Down across an off-screen block still scrolls to
  follow; Enter at the bottom edge reveals the new block; Backspace-merge and undo
  reveal the affected block.
- Fix: clicking the gutter/margin beside a block whose start is clipped above the
  fold does **not** change scrollTop. Playwright: scroll a multi-line block so its
  top is above the container top, click its gutter, assert scrollTop delta ≈ 0.
