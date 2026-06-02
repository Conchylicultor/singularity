import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { CategoricalTokenValues } from "../shared";

export interface CategoricalPresetContribution {
  id: string;
  label: string;
  light: CategoricalTokenValues;
  dark: CategoricalTokenValues;
}

export const Categorical = {
  Preset: defineSlot<CategoricalPresetContribution>("ui.categorical.preset", {
    docLabel: (p) => p.label,
  }),
};
