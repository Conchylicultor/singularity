import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { chartGroup } from "../shared";
import { chartConfig } from "./internal/config";
import { Chart } from "./slots";
import { ChartPicker } from "./components/chart-picker";
import { ChartSection } from "./components/chart-section";
import { builtInPresets } from "./presets";

export { Chart } from "./slots";
export type { ChartPresetContribution } from "./slots";

export default {
  id: "ui-tokens-chart",
  name: "UI: Chart",
  description: "Chart color token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Chart.Preset(p)),
    ConfigV2.WebRegister({ descriptor: chartConfig }),
    DynamicEnum.Options({ field: chartConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("chart", Chart.Preset.useContributions()).map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "chart",
      label: "Chart",
      descriptor: chartGroup,
      usePresets: () => Chart.Preset.useContributions(),
      configDescriptor: chartConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "chart",
      componentLabel: "Chart",
      component: ChartPicker,
    }),
    ThemeCustomizer.Section({
      id: "chart",
      label: "Chart",
      component: ChartSection,
    }),
  ],
} satisfies PluginDefinition;
