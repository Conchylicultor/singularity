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
  split(position: number, opts?: { asChild?: boolean; childType?: string }): void;
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
