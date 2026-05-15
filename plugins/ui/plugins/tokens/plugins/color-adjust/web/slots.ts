import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";

export interface ColorAdjustPresetContribution {
  id: string;
  label: string;
  hueShift: number;
  saturationScale: number;
  lightnessScale: number;
}

export const ColorAdjust = {
  Preset: defineSlot<ColorAdjustPresetContribution>("ui.color-adjust.preset", {
    docLabel: (p) => p.label,
  }),
};
