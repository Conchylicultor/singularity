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
