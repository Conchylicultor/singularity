import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import type { ShadowParams } from "../shared";
import { shadowGroup, buildShadowTiers, DEFAULT_SHADOW_PARAMS } from "../shared";
import { shadowConfig } from "./internal/config";
import { Shadow } from "./slots";
import { ShadowPicker } from "./components/shadow-picker";
import { ShadowSection } from "./components/shadow-section";
import { builtInPresets } from "./presets";

export { Shadow } from "./slots";
export type { ShadowPresetContribution } from "./slots";

export default {
  name: "UI: Shadow",
  description: "Shadow token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Shadow.Preset(p)),
    DynamicEnum.Options({ field: shadowConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("shadow").map((p) => ({ value: p.id, label: p.label }))
    }),
    ConfigV2.WebRegister({ descriptor: shadowConfig }),
    ThemeEngine.TokenGroup({
      id: "shadow",
      label: "Shadow",
      descriptor: shadowGroup,
      usePresets: () => Shadow.Preset.useContributions(),
      configDescriptor: shadowConfig,
      resolve: (preset, overrides) => {
        const shadowPreset = preset as {
          params?: ShadowParams;
          light: Record<string, string>;
          dark: Record<string, string>;
        };
        const baseParams = shadowPreset.params ?? DEFAULT_SHADOW_PARAMS;
        const merged = { ...baseParams };
        const ov = overrides as Record<string, string>;
        for (const [key, value] of Object.entries(ov)) {
          if (value !== "") {
            (merged as Record<string, unknown>)[key] =
              key === "opacity" ? parseFloat(value) : value;
          }
        }
        const tiers = buildShadowTiers(merged);
        return { light: tiers, dark: tiers };
      },
    }),
    ThemeEngine.VariantGroup({
      id: "shadow",
      componentLabel: "Shadow",
      component: ShadowPicker,
    }),
    ThemeCustomizer.Section({
      id: "shadow",
      label: "Shadow",
      component: ShadowSection,
    }),
  ],
} satisfies PluginDefinition;
