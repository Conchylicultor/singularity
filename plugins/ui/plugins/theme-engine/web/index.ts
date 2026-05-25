import { type PluginDefinition, Core } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { themeEngineConfig } from "../core";
import { ThemeInjector } from "./components/theme-injector";
import { ThemeEngine } from "./slots";

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
  contributions: [
    Core.Root({ component: ThemeInjector }),
    ConfigV2.WebRegister({ descriptor: themeEngineConfig }),
    DynamicEnum.Options({
      field: themeEngineConfig.fields.globalPreset,
      useOptions: () =>
        ThemeEngine.GlobalPreset.useContributions().map((p) => ({
          value: p.id,
          label: p.label,
        })),
    }),
  ],
} satisfies PluginDefinition;
