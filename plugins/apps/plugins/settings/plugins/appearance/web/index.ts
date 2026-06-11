import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPalette } from "react-icons/md";
import { openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { themeCustomizerPane } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";

export default {
  description:
    "Appearance settings surface: opens the theme customizer (presets, variants, tokens) as a Settings sidebar entry. The same customizer is also reachable from the floating action bar.",
  contributions: [
    Settings.Sidebar({
      id: "appearance",
      ...sidebarNavItem({
        title: "Appearance",
        icon: MdPalette,
        onClick: () => openPane(themeCustomizerPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
