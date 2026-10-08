import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { HomeApps } from "@plugins/apps/plugins/home/plugins/app-cards/web";
import { UsageFields } from "./components/usage-fields";

export default {
  description:
    "Contributes per-app usage stats into the Home app grid: opens and active time over 7 days and all time, and when the app was last opened — sortable, filterable fields shown as columns of the grid's table view.",
  contributions: [
    HomeApps.Fields({ id: "usage", section: null, component: UsageFields }),
  ],
} satisfies PluginDefinition;
