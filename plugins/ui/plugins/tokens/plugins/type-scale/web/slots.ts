import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { TypeScaleTokenValues } from "../shared";

export interface TypeScalePresetContribution {
  id: string;
  label: string;
  light: TypeScaleTokenValues;
  dark: TypeScaleTokenValues;
}

export const TypeScale = {
  Preset: defineSlot<TypeScalePresetContribution>("ui.type-scale.preset", {
    docLabel: (p) => p.label,
  }),
};
