import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSettings } from "react-icons/md";
import { Apps } from "@plugins/apps/web";
import { SettingsLayout } from "./components/settings-layout";
import { SettingsRailBadge } from "./components/settings-rail-badge";
import { SETTINGS_APP_PATH } from "./slots";

export { Settings, SETTINGS_APP_PATH } from "./slots";

export default {
  description:
    "App shell for Settings. Registers the /settings app entry, defines the Settings.Sidebar + Settings.RailBadge slots, and surfaces an attention dot on the rail icon.",
  contributions: [
    Apps.App({
      id: "settings",
      icon: MdSettings,
      tooltip: "Settings",
      component: SettingsLayout,
      path: SETTINGS_APP_PATH,
      badge: SettingsRailBadge,
    }),
  ],
} satisfies PluginDefinition;
