import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppsLayout } from "./components/apps-layout";

export { Apps, type RailFramingContribution } from "./slots";
export { AppRail } from "./components/app-rail";
export { useActiveApp, type ActiveApp } from "./internal/use-active-app";
export { useCurrentAppId } from "./use-current-app-id";
export { useTabs, type TabsApi } from "./internal/use-tabs";

export default {
  description:
    "App switcher rail. Wraps per-app shells; plugins contribute via Apps.App.",
  loadBearing: true,
  contributions: [Core.Root({ component: AppsLayout })],
} satisfies PluginDefinition;
