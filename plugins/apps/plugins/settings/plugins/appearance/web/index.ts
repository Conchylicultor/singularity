import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdDarkMode } from "react-icons/md";
import { ThemeSidebarItem } from "@plugins/theme/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";

export default {
  description:
    "Appearance settings surface: the light/dark theme toggle as a Settings sidebar entry.",
  contributions: [
    Settings.Sidebar({
      id: "appearance",
      title: "Appearance",
      icon: MdDarkMode,
      component: ThemeSidebarItem,
    }),
  ],
} satisfies PluginDefinition;
