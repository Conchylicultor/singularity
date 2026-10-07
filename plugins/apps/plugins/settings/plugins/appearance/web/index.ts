import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { themeCustomizerPane } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Appearance settings surface: opens the theme customizer (presets, variants, tokens) as a Settings sidebar entry. The same customizer is also reachable from the floating action bar.",
  contributions: [
    Settings.Sidebar({
      id: "appearance",
      title: "Appearance",
      icon: symbol("palette"),
      opens: { pane: themeCustomizerPane, params: {} },
    }),
  ],
} satisfies PluginDefinition;
