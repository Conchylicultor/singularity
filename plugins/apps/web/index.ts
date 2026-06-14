import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppsLayout } from "./components/apps-layout";

export {
  Apps,
  type RailFramingContribution,
  type SurfaceArrangementContribution,
} from "./slots";
export { AppRail } from "./components/app-rail";
export { TabSurface } from "./components/tab-surface";
export { AppTabsBody } from "./components/apps-layout";
export { useActiveApp, type ActiveApp } from "./internal/use-active-app";
export { useCurrentAppId } from "./use-current-app-id";
export { type Tab } from "./internal/tabs-store";
export { useTabs, navigate, type TabsApi } from "./internal/use-tabs";

export default {
  description:
    "App switcher rail. Wraps per-app shells; plugins contribute via Apps.App.",
  loadBearing: true,
  contributions: [Core.Root({ component: AppsLayout })],
} satisfies PluginDefinition;
