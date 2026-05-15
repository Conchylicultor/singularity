import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ShadowTokenValues } from "../shared";

export interface ShadowPresetContribution {
  id: string;
  label: string;
  light: ShadowTokenValues;
  dark: ShadowTokenValues;
}

export const Shadow = {
  Preset: defineSlot<ShadowPresetContribution>("ui.shadow.preset", {
    docLabel: (p) => p.label,
  }),
};
