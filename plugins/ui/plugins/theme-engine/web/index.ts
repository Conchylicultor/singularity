import { type PluginDefinition, Core } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { themeEngineConfig } from "../core";
import { ThemeInjector } from "./components/theme-injector";
import { themeScopeBootTask } from "./internal/boot";
import { ThemeEngine } from "./slots";

export { ThemeEngine, useTokenGroupPresets } from "./slots";
export type {
  VariantGroupContribution,
  TokenGroupContribution,
  TokenGroupPreset,
  GlobalPresetContribution,
  ColorAdjustment,
  ColorTransformContribution,
  PresetSourceContribution,
} from "./slots";
export { ThemeScope } from "./components/theme-scope";
export { ThemeScopeProvider, useThemeScopeId } from "./components/theme-scope-context";
export { ColorAdjustContext } from "./components/theme-injector";
export { useColorMode, useResolvedColorMode } from "./use-color-mode";
export type { ColorMode } from "./use-color-mode";
export { transformValues } from "./internal/transform";

export default {
  description:
    "Central settings pane for switching visual variants of pluggable UI components.",
  contributions: [
    Core.Root({ component: ThemeInjector }),
    themeScopeBootTask,
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
