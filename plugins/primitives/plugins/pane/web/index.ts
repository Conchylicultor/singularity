import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Pane,
  type,
  usePaneMatch,
  useCurrentPane,
  PaneMatchContext,
  PaneInstanceContext,
  PaneBasePathContext,
  setBasePath,
  getBasePath,
  stripBasePath,
  useRoute,
  usePaneTitle,
  useIndexMatch,
  usePathname,
  useSyncPaneRegistry,
  usePaneRoute,
  parseUrl,
  buildRouteUrl,
  getRoute,
  reorderRoute,
  restoreRoute,
  clearRoute,
  openPane,
  useOpenPane,
  createPaneStore,
  defaultStore,
  setLiveStore,
  PaneStoreContext,
  usePaneStore,
  PaneSurfaceProvider,
} from "./pane";
export type {
  PaneObject,
  PaneRouteEntry,
  PaneMatch,
  MatchEntry,
  PaneChromeConfig,
  PaneToggleOpts,
  TypeMarker,
  InferParams,
  PaneInternal,
  PaneSlot,
  PaneOpenMode,
  ResolveHook,
  PaneStore,
} from "./pane";
export { PaneChrome, PaneActionsSlot } from "./components/pane-chrome";
export { PaneIconAction } from "./components/pane-icon-action";
export { PaneResolveGuard } from "./components/pane-resolve-guard";
export { PaneLayoutContext } from "./maximize-context";

export default {
  description:
    "Unified pane primitive: Pane.define and chrome components.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
