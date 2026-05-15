import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { shadowGroup } from "../shared";
import { shadowConfig } from "./internal/config";
import { Shadow } from "./slots";
import { ShadowPicker } from "./components/shadow-picker";
import { ShadowSection } from "./components/shadow-section";
import { builtInPresets } from "./presets";

export { Shadow } from "./slots";
export type { ShadowPresetContribution } from "./slots";

export default {
  id: "ui-tokens-shadow",
  name: "UI: Shadow",
  description: "Shadow token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Shadow.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "shadow",
      label: "Shadow",
      descriptor: shadowGroup,
      usePresets: () => Shadow.Preset.useContributions(),
      configDescriptor: shadowConfig,
      pluginId: "ui-tokens-shadow",
    }),
    ThemeEngine.VariantGroup({
      componentId: "shadow",
      componentLabel: "Shadow",
      component: ShadowPicker,
    }),
    ThemeCustomizer.Section({
      id: "shadow",
      label: "Shadow",
      component: ShadowSection,
    }),
  ],
} satisfies PluginDefinition;
