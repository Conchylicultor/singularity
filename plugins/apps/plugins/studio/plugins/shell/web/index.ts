import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { studioApp } from "../core";
import { StudioLayout } from "./components/studio-layout";
import { Studio } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Studio } from "./slots";

export default {
  description:
    "App shell for Studio. Registers the /studio app entry and defines Studio.Sidebar/Toolbar slots.",
  contributions: [
    Apps.App({
      app: studioApp,
      icon: appIcon(symbol("extension")),
      component: StudioLayout,
    }),
  ],
  slots: Studio,
} satisfies PluginDefinition;
