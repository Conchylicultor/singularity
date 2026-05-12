import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { TokenGroupDescriptor } from "../core";
import type { ConfigDescriptor } from "@plugins/config/core";

export interface VariantGroupContribution {
  componentId: string;
  componentLabel: string;
  component: ComponentType;
}

export interface TokenGroupPreset {
  id: string;
  label: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface TokenGroupContribution {
  id: string;
  label: string;
  descriptor: TokenGroupDescriptor;
  usePresets: () => TokenGroupPreset[];
  configDescriptor: ConfigDescriptor;
  pluginId: string;
}

export interface GlobalPresetContribution {
  id: string;
  label: string;
  groups: Partial<Record<string, string>>;
}

export const ThemeEngine = {
  VariantGroup: defineSlot<VariantGroupContribution>(
    "ui.theme-engine.variant-group",
    { docLabel: (p) => p.componentLabel },
  ),
  TokenGroup: defineSlot<TokenGroupContribution>(
    "ui.theme-engine.token-group",
    { docLabel: (p) => p.label },
  ),
  GlobalPreset: defineSlot<GlobalPresetContribution>(
    "ui.theme-engine.global-preset",
    { docLabel: (p) => p.label },
  ),
};
