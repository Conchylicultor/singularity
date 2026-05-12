import { defineSlot } from "@core";
import type { SidebarPaletteTokenValues } from "../internal";

export interface SidebarPalettePresetContribution {
  id: string;
  label: string;
  light: SidebarPaletteTokenValues;
  dark: SidebarPaletteTokenValues;
}

export const SidebarPalette = {
  Preset: defineSlot<SidebarPalettePresetContribution>(
    "ui.sidebar-palette.preset",
    { docLabel: (p) => p.label },
  ),
};
