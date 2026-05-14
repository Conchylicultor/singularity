import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { TypographyTokenValues } from "../shared";

export interface TypographyPresetContribution {
  id: string;
  label: string;
  light: TypographyTokenValues;
  dark: TypographyTokenValues;
}

export const Typography = {
  Preset: defineSlot<TypographyPresetContribution>("ui.typography.preset", {
    docLabel: (p) => p.label,
  }),
};
