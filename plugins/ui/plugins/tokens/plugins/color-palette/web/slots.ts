import { defineSlot } from "@core";
import type { ColorPaletteTokenValues } from "../internal";

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
