import type { ReactNode } from "react";
import type { Block } from "../core";

export interface BlockEditorAPI {
  update(data: unknown): void;
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
  children: ReactNode;
  editor: BlockEditorAPI;
}
