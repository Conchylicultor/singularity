import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { pagesApp } from "../core";
import { PagesLayout } from "./components/pages-layout";
import { Pages } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { pagesInkTheme } from "./internal/theme";

export { Pages } from "./slots";
export { PagesSidebarRow } from "./components/pages-sidebar-row";

export default {
  description:
    "App shell for Pages. Registers the /pages app entry, defines the Pages.Sidebar slot (headed by the standard app-shell brand header), and contributes the app's own theme (Ink), which Pages selects.",
  contributions: [
    Apps.App({
      app: pagesApp,
      icon: appIcon(symbol("description")),
      component: PagesLayout,
    }),
    // The Pages theme, selected for the app in
    // `config/ui/theme-engine/@app/pages/theme.jsonc`.
    ThemeEngine.Theme(pagesInkTheme),
  ],
  slots: Pages,
} satisfies PluginDefinition;
