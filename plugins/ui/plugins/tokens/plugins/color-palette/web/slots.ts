import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ColorPaletteTokenValues } from "@plugins/ui/plugins/tokens/plugins/color-palette/shared";

export interface ColorPalettePresetContribution {
  id: string;
  label: string;
  light: ColorPaletteTokenValues;
  dark: ColorPaletteTokenValues;
}

export const ColorPalette = {
  Preset: defineSlot<ColorPalettePresetContribution>(
    "ui.color-palette.preset",
    { docLabel: (p) => p.label },
  ),
};
