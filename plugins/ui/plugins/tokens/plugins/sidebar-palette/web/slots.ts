import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { SidebarPaletteTokenValues } from "../shared";

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
