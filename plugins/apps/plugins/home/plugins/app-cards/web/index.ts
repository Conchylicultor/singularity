import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Home } from "@plugins/apps/plugins/home/plugins/shell/web";
import { AppGrid } from "./components/app-grid";

export default {
  name: "Home: App cards",
  description:
    "Launcher grid of one card per installed app, plus the new-app placeholder.",
  contributions: [Home.Section({ id: "apps", label: "Apps", component: AppGrid })],
} satisfies PluginDefinition;
