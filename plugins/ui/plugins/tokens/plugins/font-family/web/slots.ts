import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { FontFamilyTokenValues } from "../shared";

export interface FontFamilyPresetContribution {
  id: string;
  label: string;
  light: FontFamilyTokenValues;
  dark: FontFamilyTokenValues;
}

export const FontFamily = {
  Preset: defineSlot<FontFamilyPresetContribution>({
    docLabel: (p) => p.label,
  }),
};
