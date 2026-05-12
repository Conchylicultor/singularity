import type { PluginDefinition } from "@core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { shapeGroup } from "../internal";
import { shapeConfig } from "./internal/config";
import { Shape } from "./slots";
import { ShapePicker } from "./components/shape-picker";
import { builtInPresets } from "./presets";

export { Shape } from "./slots";
export type { ShapePresetContribution } from "./slots";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  description: "Shape token group (border-radius) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Shape.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "shape",
      label: "Shape",
      descriptor: shapeGroup,
      usePresets: () => Shape.Preset.useContributions(),
      configDescriptor: shapeConfig,
      pluginId: "ui-tokens-shape",
    }),
    ThemeEngine.VariantGroup({
      componentId: "shape",
      componentLabel: "Shape",
      component: ShapePicker,
    }),
  ],
} satisfies PluginDefinition;
