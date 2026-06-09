import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { densityGroup } from "../shared";
import { densityConfig } from "./internal/config";
import { Density } from "./slots";
import { DensityPicker } from "./components/density-picker";
import { DensitySection } from "./components/density-section";
import { builtInPresets } from "./presets";

export { Density } from "./slots";
export type { DensityPresetContribution } from "./slots";

export default {
  description: "Density token group (padding intents) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Density.Preset(p)),
    ConfigV2.WebRegister({ descriptor: densityConfig }),
    DynamicEnum.Options({ field: densityConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("density").map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "density",
      label: "Density",
      descriptor: densityGroup,
      usePresets: () => Density.Preset.useContributions(),
      configDescriptor: densityConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "density",
      componentLabel: "Density",
      component: DensityPicker,
    }),
    ThemeCustomizer.Section({
      id: "density",
      label: "Density",
      component: DensitySection,
    }),
  ],
} satisfies PluginDefinition;
