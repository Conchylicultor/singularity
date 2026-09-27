import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { prototypesApp } from "../core";
import { PrototypesLayout } from "./components/prototypes-layout";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "App shell for Prototypes. Registers the /prototypes app entry and renders the gallery + detail panes (the gallery, and the canvas of frames) in a Miller layout.",
  contributions: [
    Apps.App({
      app: prototypesApp,
      icon: appIcon(symbol("dashboard-customize")),
      component: PrototypesLayout,
    }),
  ],
} satisfies PluginDefinition;
