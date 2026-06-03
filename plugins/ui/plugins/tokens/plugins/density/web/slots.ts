import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { DensityTokenValues } from "../shared";

export interface DensityPresetContribution {
  id: string;
  label: string;
  light: DensityTokenValues;
  dark: DensityTokenValues;
}

export const Density = {
  Preset: defineSlot<DensityPresetContribution>("ui.density.preset", {
    docLabel: (p) => p.label,
  }),
};
