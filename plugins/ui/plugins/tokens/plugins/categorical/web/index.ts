import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { categoricalGroup } from "../shared";
import { categoricalConfig } from "./internal/config";
import { Categorical } from "./slots";
import { CategoricalPicker } from "./components/categorical-picker";
import { CategoricalSection } from "./components/categorical-section";
import { builtInPresets } from "./presets";

export { Categorical } from "./slots";
export type { CategoricalPresetContribution } from "./slots";

export default {
  description: "Categorical color palette token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Categorical.Preset(p)),
    ConfigV2.WebRegister({ descriptor: categoricalConfig }),
    DynamicEnum.Options({ field: categoricalConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("categorical").map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "categorical",
      label: "Categorical",
      descriptor: categoricalGroup,
      usePresets: () => Categorical.Preset.useContributions(),
      configDescriptor: categoricalConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "categorical",
      componentLabel: "Categorical",
      component: CategoricalPicker,
    }),
    ThemeCustomizer.Section({
      id: "categorical",
      label: "Categorical",
      component: CategoricalSection,
    }),
  ],
} satisfies PluginDefinition;
