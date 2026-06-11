import type { Block } from "../core";

export interface BlockEditorAPI {
  update(data: unknown): void;
  /** Toggle this block's expanded/collapsed state (children show/hide). */
  setExpanded(expanded: boolean): void;
  /**
   * Convert this block to another type, replacing its data payload. `opts.expanded`
   * also resets the open/collapsed state in the same PATCH.
   */
  convertTo(type: string, data: unknown, opts?: { expanded?: boolean }): void;
  /** Insert a new block of the given type immediately after this one, then focus it. */
  insertAfter(type: string, data: unknown): void;
  /**
   * Split this block at `position`, moving the trailing text into a new block.
   * `asChild` is normally derived internally: when the caret is at the very end
   * of a block that has visible (expanded) children, the new block is nested as
   * the first child instead of inserted as a following sibling. Pass
   * `opts.asChild`/`opts.childType` to force nesting (and the child's type).
   */
  split(position: number, opts?: { asChild?: boolean; childType?: string }): void;
  /**
   * Backspace-at-start intent. If this block is indented (its parent is a normal
   * content block, not the page), this de-indents (outdents) it and keeps focus.
   * Otherwise it merges this block's text into the previous sibling and focuses
   * that sibling. No-op for the first block at top level.
   */
  merge(): void;
  remove(): void;
  indent(): void;
  outdent(): void;
  focusUp(): void;
  focusDown(): void;
  onFocus(): void;
}

export interface BlockRendererProps {
  block: Block;
  isFocused: boolean;
  editor: BlockEditorAPI;
}
