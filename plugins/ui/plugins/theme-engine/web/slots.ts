import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { TokenGroupDescriptor } from "../core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

export interface VariantGroupContribution {
  id: string;
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
  resolve?: (
    preset: TokenGroupPreset,
    overrides: Record<string, unknown>,
  ) => { light: Record<string, string>; dark: Record<string, string> };
}

export interface GlobalPresetContribution {
  id: string;
  label: string;
  groups: Partial<Record<string, string>>;
}

export interface ColorAdjustment {
  hueShift: number;
  saturationScale: number;
  lightnessScale: number;
}

export interface ColorTransformContribution {
  useAdjustment: () => ColorAdjustment;
}

export interface PresetSourceContribution {
  usePresets: (groupId: string) => TokenGroupPreset[];
}

export function useTokenGroupPresets(groupId: string): TokenGroupPreset[] {
  const group = ThemeEngine.TokenGroup.useContributions().find(
    (g) => g.id === groupId,
  );
  const staticPresets = group?.usePresets() ?? [];
  // eslint-disable-next-line react-hooks/rules-of-hooks -- PresetSource contributions are static slot entries; count never changes
  const dynamic = ThemeEngine.PresetSource.useContributions()
    .flatMap((s) => s.usePresets(groupId));
  return [...staticPresets, ...dynamic];
}

export const ThemeEngine = {
  VariantGroup: defineRenderSlot<VariantGroupContribution>(
    "ui.theme-engine.variant-group",
    { docLabel: (p) => p.componentLabel, reorder: false },
  ),
  TokenGroup: defineSlot<TokenGroupContribution>(
    "ui.theme-engine.token-group",
    { docLabel: (p) => p.label },
  ),
  GlobalPreset: defineSlot<GlobalPresetContribution>(
    "ui.theme-engine.global-preset",
    { docLabel: (p) => p.label },
  ),
  ColorTransform: defineSlot<ColorTransformContribution>(
    "ui.theme-engine.color-transform",
    { docLabel: () => "Color Transform" },
  ),
  PresetSource: defineSlot<PresetSourceContribution>(
    "ui.theme-engine.preset-source",
    { docLabel: () => "Preset Source" },
  ),
};
