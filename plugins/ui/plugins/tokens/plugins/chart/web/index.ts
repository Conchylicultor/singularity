import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { chartGroup } from "../shared";
import { chartConfig } from "./internal/config";
import { Chart } from "./slots";
import { ChartPicker } from "./components/chart-picker";
import { builtInPresets } from "./presets";

export { Chart } from "./slots";
export type { ChartPresetContribution } from "./slots";

export default {
  id: "ui-tokens-chart",
  name: "UI: Chart",
  description: "Chart color token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Chart.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "chart",
      label: "Chart",
      descriptor: chartGroup,
      usePresets: () => Chart.Preset.useContributions(),
      configDescriptor: chartConfig,
      pluginId: "ui-tokens-chart",
    }),
    ThemeEngine.VariantGroup({
      componentId: "chart",
      componentLabel: "Chart",
      component: ChartPicker,
    }),
  ],
} satisfies PluginDefinition;
