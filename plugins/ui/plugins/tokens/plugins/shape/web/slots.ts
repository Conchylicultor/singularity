import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ShapeTokenValues } from "../shared";

export interface ShapePresetContribution {
  id: string;
  label: string;
  light: ShapeTokenValues;
  dark: ShapeTokenValues;
}

export const Shape = {
  Preset: defineSlot<ShapePresetContribution>({
    docLabel: (p) => p.label,
  }),
};
