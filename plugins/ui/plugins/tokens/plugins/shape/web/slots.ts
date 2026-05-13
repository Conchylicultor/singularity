import { defineSlot } from "@core";
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
