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
  // undefined = the source is still loading — distinct from "no presets for
  // this group". GroupStyle skips injection while any source is pending, so a
  // dynamic source must never report a half-loaded list as final.
  usePresets: (groupId: string) => TokenGroupPreset[] | undefined;
}

export type TokenGroupPresets =
  | { pending: true }
  | { pending: false; presets: TokenGroupPreset[] };

export function useTokenGroupPresets(groupId: string): TokenGroupPresets {
  const group = ThemeEngine.TokenGroup.useContributions().find(
    (g) => g.id === groupId,
  );
  const staticPresets = group?.usePresets() ?? [];
  // eslint-disable-next-line react-hooks/rules-of-hooks -- PresetSource contributions are static slot entries; count never changes
  const dynamic = ThemeEngine.PresetSource.useContributions()
    .map((s) => s.usePresets(groupId));
  if (dynamic.some((d) => d === undefined)) return { pending: true };
  return {
    pending: false,
    presets: [...staticPresets, ...dynamic.flatMap((d) => d!)],
  };
}

// Options-shaped read for the token groups' DynamicEnum preset pickers. The
// pending state (a dynamic source still loading) renders as an empty option
// list and self-fills on resolve — that decision lives here once, not in each
// token-group plugin. (In practice pending is never observed: dynamic sources
// hydrate via Core.Boot before first render.)
export function useTokenGroupPresetOptions(
  groupId: string,
): { value: string; label: string }[] {
  const state = useTokenGroupPresets(groupId);
  if (state.pending) return [];
  return state.presets.map((p) => ({ value: p.id, label: p.label }));
}

export const ThemeEngine = {
  VariantGroup: defineRenderSlot<VariantGroupContribution>(
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
  ColorTransform: defineSlot<ColorTransformContribution>(
    "ui.theme-engine.color-transform",
    { docLabel: () => "Color Transform" },
  ),
  PresetSource: defineSlot<PresetSourceContribution>(
    "ui.theme-engine.preset-source",
    { docLabel: () => "Preset Source" },
  ),
};
