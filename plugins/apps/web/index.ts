import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppsLayout } from "./components/apps-layout";

export { Apps } from "./slots";
export { useActiveApp, type ActiveApp } from "./internal/use-active-app";
export { useCurrentAppId } from "./use-current-app-id";

export default {
  name: "Apps",
  description:
    "App switcher rail. Wraps per-app shells; plugins contribute via Apps.App.",
  loadBearing: true,
  contributions: [Core.Root({ component: AppsLayout })],
} satisfies PluginDefinition;
