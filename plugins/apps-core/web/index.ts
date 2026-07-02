import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Apps,
  type RailFramingContribution,
  type SurfaceContribution,
  type TabBarContribution,
} from "./slots";
export {
  useActiveApp,
  usePathname,
  type ActiveApp,
} from "./internal/use-active-app";
export {
  matchAppForPath,
  defaultApp,
  resolveAppForPath,
  type ResolvedApp,
} from "./internal/resolve-app";
export { useCurrentAppId } from "./use-current-app-id";
export type { Placement } from "../core";

export default {
  description:
    "App switcher rail. Wraps per-app shells; plugins contribute via Apps.App.",
  loadBearing: true,
} satisfies PluginDefinition;
