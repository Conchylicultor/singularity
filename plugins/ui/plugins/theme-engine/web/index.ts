import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { VariantSettings } from "./components/variant-settings";

export { ThemeEngine } from "./slots";
export type { VariantGroupContribution } from "./slots";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  description:
    "Central settings pane for switching visual variants of pluggable UI components.",
  contributions: [
    Config.Section({
      id: "ui-variants",
      title: "UI component variants",
      description:
        "Choose the active visual variant for each pluggable component.",
      component: VariantSettings,
    }),
  ],
} satisfies PluginDefinition;
