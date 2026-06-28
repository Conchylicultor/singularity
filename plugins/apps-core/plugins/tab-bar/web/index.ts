import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AppTabBar } from "./components/app-tab-bar";

export default {
  description:
    "App tab bar: the top tab strip with per-tab titles, overflow collapse, drag reorder/tear-off, and the new-tab/new-window + button.",
} satisfies PluginDefinition;
