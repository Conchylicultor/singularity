import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { deployApp } from "../core";
import { DeployLayout } from "./components/deploy-layout";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description: "App shell for the deploy platform.",
  contributions: [
    Apps.App({
      app: deployApp,
      icon: appIcon(symbol("cloud")),
      component: DeployLayout,
    }),
  ],
} satisfies PluginDefinition;
