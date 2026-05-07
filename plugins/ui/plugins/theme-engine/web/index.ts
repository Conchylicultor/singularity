import { type PluginDefinition, Core } from "@core";
import { Config } from "@plugins/config/web";
import { ThemeInjector } from "./components/theme-injector";
import { VariantSettings } from "./components/variant-settings";

export { ThemeEngine } from "./slots";
export type {
  VariantGroupContribution,
  TokenGroupContribution,
  TokenGroupPreset,
  GlobalPresetContribution,
} from "./slots";
export { ThemeScope } from "./components/theme-scope";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  description:
    "Central settings pane for switching visual variants of pluggable UI components.",
  contributions: [
    Core.Root({ component: ThemeInjector }),
    Config.Section({
      id: "ui-variants",
      title: "UI Themes",
      description:
        "Choose the global theme and visual variant for each pluggable component.",
      component: VariantSettings,
    }),
  ],
} satisfies PluginDefinition;
