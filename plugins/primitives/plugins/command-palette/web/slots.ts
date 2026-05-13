import type { ComponentType } from "react";
import { defineSlot } from "@core";

export interface CommandPaletteItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Display-only shortcut badge, e.g. "⌘B" */
  shortcut?: string;
  /** Extra fuzzy-match targets beyond the label */
  keywords?: string[];
  /** Group header label */
  group?: string;
  onSelect: () => void;
}

export const CommandPalette = {
  Item: defineSlot<CommandPaletteItem>("command-palette.item", {
    docLabel: (p) => p.label,
  }),
};
