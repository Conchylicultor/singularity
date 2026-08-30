import {
  spaceLength,
  type SpaceStep,
} from "@plugins/primitives/plugins/css/plugins/space-ramp/core";

/**
 * The single declaration site for the page column's horizontal geometry.
 *
 * The invariant — a page's **block content box** has a left edge `C`:
 * - `C` is the **origin** the surface computes and the rail seats against; it is
 *   where a block's box is *measured from*, not where paint lands.
 * - Block **content** (text, media) insets from `C` by `BLOCK_INSET`.
 * - Block **decorations paint that same content box**, so a box's own edge and
 *   the first letter of the prose above it share one x. A code block's
 *   background, a place block's card and a container's frame all sit at
 *   `[C + BLOCK_INSET, R - BLOCK_INSET]` — see `frameBoxLeft` /
 *   `frameBoxRightInset`, which is how the container family says it.
 * - Anything a host renders *alongside* blocks that is not itself a block — the
 *   page title, the page icon, the section list — sits at `C + BLOCK_INSET`.
 *
 * This used to read "block decorations start at `C`", and the container frame
 * was the only thing that believed it: an ordinary decorated block (code, place)
 * paints inside its own `<Inset x={BLOCK_INSET}>` content box and always did.
 * So a callout's tint stood `BLOCK_INSET` to the LEFT of every paragraph on the
 * page, and of every other decorated box. Measured, then fixed — the container
 * frame now paints what everything else paints.
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
 * decoration column free. `BlockRow` takes the resolved seat as a prop; the
 * editor derives it from the frame spans it already computes, so rows still
 * compute no geometry of their own.
 *
 * That SPAN rule is geometry and nothing else — it says where the controls sit,
 * never what they act on. WHICH block a row's rail targets is a separate
 * BORROW-CHAIN rule, because only a container's borrowed first LINE hands its
 * rail over while lines 2..n inside the same frame keep their own. Both live on
 * `RailSeat` (`internal/rail-seat.ts`); conflating them is what let the drag
 * handle on a callout's first line pull that line out of the box.
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
 * is what `resolveRailSeats` evaluates (at the row's own depth, or at its
 * outermost enclosing frame's) to hand each row its seat's `left`.
 */
export function blockContentLeft(depth: number): number {
  return BLOCK_GUTTER + depth * BLOCK_INDENT;
}

/**
 * The left edge of the box a container frame paints, as a CSS length: its own
 * content edge `C`, plus the same `BLOCK_INSET` every other decorated block
 * already insets its box by. This is what puts a card's border on the same x as
 * the first letter of the paragraph above it.
 *
 * A `calc()` over `var(--space-md)` rather than a resolved px number, so the box
 * follows the density preset exactly as the content it wraps does — resolving
 * the token in JS would freeze it at whatever the ramp said on first render.
 *
 * The frame's DECORATION COLUMN (the callout's icon) reads this too: the glyph
 * seats inside the box it decorates, so the two cannot drift.
 */
export function frameBoxLeft(contentEdge: number): string {
  return `calc(${contentEdge}px + ${spaceLength(BLOCK_INSET)})`;
}

/**
 * The right inset of that same box, for a row (or frame) wrapped in
 * `frameCount` container frames — one `BLOCK_INSET` per enclosing frame, so a
 * nested card closes inside its parent the way its left edge opens inside it.
 *
 * It is what a framed ROW reserves as `padding-right` and what the frame itself
 * pulls its right edge in by, from the one count: with both derived here, a
 * card's text can never end past its own tint, and two frames at the same depth
 * can never disagree about where the box ends.
 *
 * `frameCount === 0` (an unframed row) is `0`, not a token — an unframed row
 * reserves nothing.
 */
export function frameBoxRightInset(frameCount: number): string {
  return frameCount === 0
    ? "0px"
    : `calc(${frameCount} * ${spaceLength(BLOCK_INSET)})`;
}
