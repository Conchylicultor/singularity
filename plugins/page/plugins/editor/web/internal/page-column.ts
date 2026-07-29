import type { SpaceStep } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/**
 * The single declaration site for the page column's horizontal geometry.
 *
 * The invariant — a page's **block content box** has a left edge `C`:
 * - Block **decorations** start at `C`: the quote's left border, the callout
 *   tint, the code background, the image, the divider rule, the selection
 *   highlight, the diff rail.
 * - Block **content** (text, media) insets from `C` by `BLOCK_INSET`.
 * - Anything a host renders *alongside* blocks that is not itself a block — the
 *   page title, the page icon, the section list — sits at `C + BLOCK_INSET`.
 *
 * The editable surface puts the hover rail (`BLOCK_GUTTER`) to the *left* of
 * `C`, inside each row's own padding — that placement is editable-surface-only
 * (the read-only renderer has no rail, so `C` is simply its left edge). Each row
 * reserves the rail as its OWN padding-left (not the list container's) so the
 * rail is inside the row's box: the hover controls (+ / drag / chevron) sit at
 * -60/-40/-20 from the content edge of its **outermost enclosing container
 * frame** — which for an unframed row is its own — and the pointer entering the
 * rail from anywhere, including from the far left or across the gap left by an
 * absent chevron, hovers the row and reveals them. Reserving the rail on the
 * container instead would put it outside every row, and since the controls are
 * `pointer-events-none` while hidden, nothing under the pointer could ever
 * reveal them. `BLOCK_GUTTER` must stay wider than the leftmost button's offset.
 *
 * The outermost-frame rule (rather than the simpler "its own content edge") is
 * forced by container ANCHORS: an anchor's decoration column occupies
 * `[C, C+BLOCK_INDENT]`, which is exactly where its first child's chevron would
 * sit if that child seated its rail against its own edge — and the child's row
 * comes later in DOM order at the same `z-raised` level, so the decoration would
 * not merely be overlapped, it would be unclickable. Seating a framed row's rail
 * against the frame's edge puts the controls OUTSIDE the box, leaving the
 * decoration column free. `BlockRow` takes the resolved `railLeft` as a prop;
 * the editor derives it from the frame spans it already computes, so rows still
 * compute no geometry of their own.
 *
 * Hosts must never re-derive the content edge from `BLOCK_GUTTER` plus whatever
 * padding their wrapper happens to carry — they align onto it via
 * `PageContentColumn` / `BLOCK_INSET`, and `BLOCK_GUTTER` is editor-internal.
 */

/** Rail width (px): hover controls hang into it at -20/-40/-60 from the content edge. */
export const BLOCK_GUTTER = 64;

/** Per-depth indent (px) of a nested block's content box. */
export const BLOCK_INDENT = 24;

/** Decoration-edge → content-edge inset. Every block's content sits here. */
export const BLOCK_INSET: SpaceStep = "md";

/** Fixed leading-marker column (bullet / number / checkbox / callout icon). */
export const MARKER_GUTTER = "1.5rem";

/**
 * The content edge `C` of a block at `depth`, in px from the row's own left
 * border edge (which is where the rail starts). The single derivation of the
 * rail + per-depth indent sum — a container frame insets its decoration to it so
 * the box starts at the content edge instead of bleeding over the rail, and it
 * is what the editor evaluates (at the row's own depth, or at its outermost
 * enclosing frame's) to hand `BlockRow` its `railLeft`.
 */
export function blockContentLeft(depth: number): number {
  return BLOCK_GUTTER + depth * BLOCK_INDENT;
}
