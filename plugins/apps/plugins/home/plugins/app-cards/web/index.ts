import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Home } from "@plugins/apps/plugins/home/plugins/shell/web";
import { AppGrid } from "./components/app-grid";
import { HomeApps } from "./slots";

export { HomeApps } from "./slots";

export default {
  description:
    "Launcher grid of one card per installed app, plus the new-app placeholder.",
  slots: { ...HomeApps },
  contributions: [
    Home.Section({ id: "apps", label: "Apps", component: AppGrid }),
  ],
} satisfies PluginDefinition;
