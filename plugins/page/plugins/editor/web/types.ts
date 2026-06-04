import type { Block } from "../core";

export interface BlockEditorAPI {
  update(data: unknown): void;
  /** Convert this block to another type, replacing its data payload. */
  convertTo(type: string, data: unknown): void;
  /** Insert a new block of the given type immediately after this one, then focus it. */
  insertAfter(type: string, data: unknown): void;
  split(position: number): void;
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
