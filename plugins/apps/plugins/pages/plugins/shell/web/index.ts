import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { pagesApp } from "../core";
import { PagesLayout } from "./components/pages-layout";
import { Pages } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Pages } from "./slots";

export default {
  description:
    "App shell for Pages. Registers the /pages app entry and defines the Pages.Sidebar slot.",
  contributions: [
    Apps.App({
      app: pagesApp,
      icon: appIcon(symbol("description")),
      component: PagesLayout,
    }),
  ],
  slots: Pages,
} satisfies PluginDefinition;
