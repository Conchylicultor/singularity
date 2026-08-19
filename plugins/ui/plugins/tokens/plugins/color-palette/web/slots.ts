import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ColorPaletteTokenValues } from "../shared";

export interface ColorPalettePresetContribution {
  id: string;
  label: string;
  light: ColorPaletteTokenValues;
  dark: ColorPaletteTokenValues;
}

export const ColorPalette = {
  Preset: defineSlot<ColorPalettePresetContribution>({
    docLabel: (p) => p.label,
  }),
};
