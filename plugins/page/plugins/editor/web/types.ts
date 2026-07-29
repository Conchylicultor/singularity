import type { Block, RichText } from "../core";
import type { CaretContext } from "./internal/caret-geometry";

export interface BlockEditorAPI {
  update(data: unknown): void;
  /** Toggle this block's expanded/collapsed state (children show/hide). */
  setExpanded(expanded: boolean): void;
  /**
   * Convert this block to another type, replacing its data payload. `opts.expanded`
   * also resets the open/collapsed state in the same PATCH.
   */
  convertTo(type: string, data: unknown, opts?: { expanded?: boolean }): void;
  /**
   * Insert a new block of the given type immediately after this one and return
   * its id (minted client-side, so the caller can act on it without awaiting the
   * server). Focuses the new block unless `opts.focus === false` — the gutter `+`
   * keeps focus in its block-type filter and hands it to the block on close.
   */
  insertAfter(type: string, data: unknown, opts?: { focus?: boolean }): string;
  /**
   * Split this block at `position`, moving the trailing text into a new block.
   * `asChild` is normally derived internally: when the caret is at the very end
   * of a block that has visible (expanded) children, the new block is nested as
   * the first child instead of inserted as a following sibling. Pass
   * `opts.asChild`/`opts.childType` to force nesting (and the child's type).
   * `opts.runs` carries the editor's authoritative current rich-text so the
   * reducer splits the live content rather than the (possibly stale) stored one.
   * `opts.tailData` is the resolved per-type-transformed `data` for the tail
   * (e.g. a checked to-do splits into an unchecked one), carried onto the op.
   */
  split(
    position: number,
    opts?: {
      asChild?: boolean;
      childType?: string;
      siblingType?: string;
      tailData?: unknown;
      runs?: RichText;
    },
  ): void;
  /**
   * Backspace-at-start intent. If this block is indented (its parent is a normal
   * content block, not the page), this de-indents (outdents) it and keeps focus.
   * Otherwise it merges this block's text into the previous sibling and focuses
   * that sibling. No-op for the first block at top level. `opts.runs` carries the
   * editor's authoritative current rich-text so the reducer merges the live
   * content rather than the (possibly stale) stored one.
   */
  merge(opts?: { runs?: RichText }): void;
  /**
   * Delete-at-end intent (Backspace's mirror). Merges the NEXT visible line up
   * into this block — the source is that next line, so its LIVE runs are read
   * from its own handle. By the visible-line duality the merge target resolves
   * back to this block, so the join lands in this editor and the caret does not
   * move. No-op when this is the last visible line. Takes no `runs`: the source
   * is a different block, read here, not the caller's editor.
   */
  mergeNext(): void;
  remove(): void;
  indent(): void;
  outdent(): void;
  /**
   * Move the caret to the nearest focusable block in `dir`, skipping void blocks
   * with no caret. Up/Down preserve the caret's pixel column (`caret.caretX`);
   * Left/Right land at the previous block's end / next block's start. `caret` is
   * omitted by void/textarea blocks (divider, code) that have no Lexical caret —
   * the target then lands at its boundary edge.
   */
  navigate(dir: "up" | "down" | "left" | "right", caret?: CaretContext): void;
  onFocus(): void;
}

export interface BlockRendererProps {
  block: Block;
  isFocused: boolean;
  editor: BlockEditorAPI;
  /** 1-based position within the consecutive run of same-type siblings; only ordinalMarker blocks use it. */
  ordinal: number;
}

/**
 * Props for a CONTAINER FRAME — the decorated box a container block type paints
 * over itself AND its whole visible subtree (the callout's tint, and any future
 * bordered container).
 *
 * A block renderer (`BlockRendererProps`) can only ever paint its OWN row: the
 * editable surface renders the forest as a flat list of sibling rows so a
 * structural move only reorders keyed elements (see `block-editor.tsx`'s
 * `flattenTree`), which means a block's children are not its DOM children. A
 * frame contribution is the seam for the other half.
 *
 * ## A frame is a BACKDROP, never a wrapper
 *
 * It renders a standalone box and receives **no children**. Each surface sizes
 * and positions it over the container's rows in whatever way suits that surface
 * (the editor spans CSS grid lines; the read-only renderer paints an
 * `absolute inset-0` layer behind its nested subtree). That contract is
 * load-bearing, not stylistic: a frame that WRAPPED the rows would change their
 * DOM parent whenever a block is indented across its boundary, remounting that
 * block's Lexical instance and dropping the caret — measured, see
 * `internal/block-frames.ts`.
 *
 * Consequences a frame must respect:
 *
 * - It is **inert**: the surface renders it `pointer-events-none`, behind the
 *   rows — frames are emitted BEFORE the rows they span (equal stacking level →
 *   document order decides), so anything interactive placed in that layer is
 *   hit-tested *under* the following row and can never be clicked. It cannot
 *   host controls. The sanctioned interactive companion is the **anchor**
 *   (`BlockAnchorProps`), which the surface renders in the row layer.
 * - It is given a **positioned box** to paint into and has no content of its
 *   own, so it fills that box with `absolute` insets. Do NOT use `h-full`: an
 *   explicit height defeats the editor's grid stretch, and any vertical bleed
 *   then shifts the box instead of growing it.
 * - It must add no horizontal offset of its own beyond `inset`: rows seat their
 *   hover controls against a content edge the SURFACE computed (this frame's,
 *   for the rows inside it), so shifting the flow would strand them.
 */
export interface BlockFrameProps {
  /** The container block's type — the dispatch key. */
  type: string;
  /** The container block's `data`; the frame reads its own appearance off it. */
  data: unknown;
  /**
   * Distance (px) from the frame box's left edge to the container block's
   * content edge `C`. The decoration starts here so it aligns with the block
   * content instead of bleeding over the editable surface's hover rail. Zero on
   * surfaces with no rail (the read-only renderer).
   */
  inset: number;
}

/**
 * Props for a container ANCHOR's decoration — the leading glyph of a block type
 * that declares `BlockHandle.anchor` (the callout's icon). An anchor renders no
 * line of its own: its content IS its children, so the row itself collapses to
 * zero height and this component is the only thing it paints.
 *
 * ## The SURFACE owns the geometry; this renders appearance + interaction
 *
 * The surface positions this component in a `BLOCK_INDENT`-wide column at the
 * container's content edge `C`, vertically centred on the FIRST VISIBLE CHILD's
 * first line (borrowed, because the anchor has no line of its own to measure —
 * see `BlockHandle.gutterFirstLineCenter`). A contribution therefore:
 *
 * - **must not position itself** — `BLOCK_GUTTER` is deliberately not exported
 *   from the web barrel and `BlockRendererProps` carries no `depth`, precisely so
 *   no block contribution can compute the content edge;
 * - **must not establish flow height** — the column is `absolute`, and the row's
 *   zero height is what lets the anchor and its first child share one visual
 *   line. Anything that grows the row pushes the whole container apart.
 *
 * Unlike a frame this IS interactive: it sits in the row layer, above the frame,
 * so it can carry the container's own affordances (icon/colour picker, block
 * actions). That is the whole reason the frame stays inert — see
 * `BlockFrameProps`.
 *
 * `editor` is absent on read-only surfaces (the blog renderer, the
 * version-history preview), which have no block API at all. Degrade to a static
 * glyph rather than rendering a dead control.
 */
export interface BlockAnchorProps {
  /**
   * The container block's id. An anchor is the container's ONLY affordance (its
   * row carries no hover rail — see `BlockRow`), so its menu owns the structural
   * actions an ordinary row gets from the gutter handle: `unwrapBlock(id)` to
   * dissolve the box keeping its content, `editor.remove()` to delete it with its
   * subtree. Both are addressed by id, so the props must carry one.
   */
  id: string;
  /** The container block's type — the dispatch key. */
  type: string;
  /** The container block's `data`; the anchor reads its own appearance off it. */
  data: unknown;
  /** The block API, on editable surfaces only. Absent ⇒ render a static glyph. */
  editor?: BlockEditorAPI;
}
