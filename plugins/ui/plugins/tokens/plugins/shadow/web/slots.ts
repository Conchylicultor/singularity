import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ShadowParams, ShadowTokenValues } from "../shared";

export interface ShadowPresetContribution {
  id: string;
  label: string;
  params?: ShadowParams;
  light: ShadowTokenValues;
  dark: ShadowTokenValues;
}

export const Shadow = {
  Preset: defineSlot<ShadowPresetContribution>({
    docLabel: (p) => p.label,
  }),
};
