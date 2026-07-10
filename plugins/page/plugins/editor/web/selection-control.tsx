import { createContext, useContext } from "react";

/**
 * Imperative block-selection controls shared between the selection layer (which
 * owns the anchor/head and the focusable container) and deep children that need
 * to drive selection — `BlockRow` (shift-click) and the in-block `KeyboardPlugin`
 * (Esc / Shift+Arrow at a boundary). Lives below `MultiSelectProvider` so it can
 * translate intents into contiguous range updates.
 *
 * Every member focuses the selection container as part of its effect: entering
 * selection mode means the container, not a block editor, owns the keyboard.
 */
export interface SelectionControl {
  /** Leave text editing and select this whole block; optionally extend one step. */
  enterSelectionMode: (blockId: string, extend?: "up" | "down") => void;
  /** Shift-click: extend the range from the current anchor to this block. */
  extendTo: (blockId: string) => void;
  /** Clear the selection. */
  clear: () => void;
}

const SelectionControlContext = createContext<SelectionControl | null>(null);

export const SelectionControlProvider = SelectionControlContext.Provider;

export function useSelectionControl(): SelectionControl | null {
  return useContext(SelectionControlContext);
}
