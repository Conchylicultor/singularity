import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { Apps } from "@plugins/apps-core/web";
import { settingsApp } from "../core";
import { SettingsLayout } from "./components/settings-layout";
import { SettingsRailBadge } from "./components/settings-rail-badge";
import { Settings } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Settings } from "./slots";

export default {
  description:
    "App shell for Settings. Registers the /settings app entry, defines the Settings.Sidebar + Settings.RailBadge slots, and surfaces an attention dot on the rail icon.",
  contributions: [
    Apps.App({
      app: settingsApp,
      icon: appIcon(symbol("settings"), { color: "slate" }),
      component: SettingsLayout,
      badge: SettingsRailBadge,
    }),
  ],
  slots: Settings,
} satisfies PluginDefinition;
