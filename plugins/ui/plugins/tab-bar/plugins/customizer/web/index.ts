import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { VariantPicker } from "./components/variant-picker";

export default {
  description:
    "Registers the tab-bar variant picker (chip / underline / connected) into the theme customizer.",
  contributions: [
    ThemeEngine.VariantGroup({
      id: "tab-bar",
      componentLabel: "Tab bar",
      component: VariantPicker,
      selects: "component",
    }),
  ],
} satisfies PluginDefinition;
