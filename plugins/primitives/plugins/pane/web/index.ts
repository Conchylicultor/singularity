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
  PaneSurfaceAppContext,
  useSurfaceAppId,
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
  PaneInput,
  PaneSlot,
  PaneOpenMode,
  OpenPaneFn,
  ResolveHook,
  PaneStore,
} from "./pane";
export { PaneChrome, PaneActionsSlot } from "./components/pane-chrome";
export { PaneScroll, type PaneScrollProps } from "./components/pane-scroll";
export { PaneIconAction } from "./components/pane-icon-action";
export { PaneResolveGuard } from "./components/pane-resolve-guard";
export { useRenderSync } from "./use-render-sync";
export { PaneLayoutContext } from "./maximize-context";
export { SurfaceChromeContext } from "./surface-chrome-context";
export type { SurfaceChrome } from "./surface-chrome-context";

export default {
  description:
    "Unified pane primitive: Pane.define and chrome components.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
