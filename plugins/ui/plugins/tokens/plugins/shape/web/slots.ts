import { defineSlot } from "@core";
import type { ShapeTokenValues } from "../internal";

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
