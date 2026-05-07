import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface VariantGroupContribution {
  componentId: string;
  componentLabel: string;
  component: ComponentType;
}

export const ThemeEngine = {
  VariantGroup: defineSlot<VariantGroupContribution>(
    "ui.theme-engine.variant-group",
  ),
};
