import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FontFamilyTokenValues } from "../shared";

export interface FontFamilyPresetContribution {
  id: string;
  label: string;
  light: FontFamilyTokenValues;
  dark: FontFamilyTokenValues;
}

export const FontFamily = {
  Preset: defineSlot<FontFamilyPresetContribution>("ui.font-family.preset", {
    docLabel: (p) => p.label,
  }),
};
