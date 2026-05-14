import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ShapeTokenValues } from "@plugins/ui/plugins/tokens/plugins/shape/shared";

export interface ShapePresetContribution {
  id: string;
  label: string;
  light: ShapeTokenValues;
  dark: ShapeTokenValues;
}

export const Shape = {
  Preset: defineSlot<ShapePresetContribution>("ui.shape.preset", {
    docLabel: (p) => p.label,
  }),
};
