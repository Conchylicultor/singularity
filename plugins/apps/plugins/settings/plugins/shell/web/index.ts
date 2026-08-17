import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSettings } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { Apps } from "@plugins/apps-core/web";
import { settingsApp } from "../core";
import { SettingsLayout } from "./components/settings-layout";
import { SettingsRailBadge } from "./components/settings-rail-badge";
import { Settings } from "./slots";

export { Settings } from "./slots";

export default {
  description:
    "App shell for Settings. Registers the /settings app entry, defines the Settings.Sidebar + Settings.RailBadge slots, and surfaces an attention dot on the rail icon.",
  contributions: [
    Apps.App({
      app: settingsApp,
      icon: mdAppIcon(MdSettings),
      component: SettingsLayout,
      badge: SettingsRailBadge,
    }),
  ],
  slots: [Settings],
} satisfies PluginDefinition;
