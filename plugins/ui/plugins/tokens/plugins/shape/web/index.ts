import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { shapeGroup } from "../shared";
import { shapeConfig } from "./internal/config";
import { Shape } from "./slots";
import { ShapePicker } from "./components/shape-picker";
import { ShapeSection } from "./components/shape-section";
import { builtInPresets } from "./presets";

export { Shape } from "./slots";
export type { ShapePresetContribution } from "./slots";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  description: "Shape token group (border-radius) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Shape.Preset(p)),
    ConfigV2.WebRegister({ descriptor: shapeConfig }),
    ThemeEngine.TokenGroup({
      id: "shape",
      label: "Shape",
      descriptor: shapeGroup,
      usePresets: () => Shape.Preset.useContributions(),
      configDescriptor: shapeConfig,
    }),
    ThemeEngine.VariantGroup({
      componentId: "shape",
      componentLabel: "Shape",
      component: ShapePicker,
    }),
    ThemeCustomizer.Section({
      id: "shape",
      label: "Shape",
      component: ShapeSection,
    }),
  ],
} satisfies PluginDefinition;
