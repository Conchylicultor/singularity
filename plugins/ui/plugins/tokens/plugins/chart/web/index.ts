import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
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
    ThemeEngine.TokenGroup({
      id: "chart",
      label: "Chart",
      descriptor: chartGroup,
      usePresets: () => Chart.Preset.useContributions(),
      configDescriptor: chartConfig,
    }),
    ThemeEngine.VariantGroup({
      componentId: "chart",
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
