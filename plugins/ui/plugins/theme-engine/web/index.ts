import { type PluginDefinition, Core } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeInjector } from "./components/theme-injector";

export { ThemeEngine } from "./slots";
export type {
  VariantGroupContribution,
  TokenGroupContribution,
  TokenGroupPreset,
  GlobalPresetContribution,
  ColorAdjustment,
  ColorTransformContribution,
} from "./slots";
export { ThemeScope } from "./components/theme-scope";
export { ColorAdjustContext } from "./components/theme-injector";
export { transformValues } from "./internal/transform";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  description:
    "Central settings pane for switching visual variants of pluggable UI components.",
  contributions: [Core.Root({ component: ThemeInjector })],
} satisfies PluginDefinition;
