import { Pane as PaneSlots } from "./slots";
import { paneHeaderContributions } from "./header-slot";
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
  peekBasePath,
  stripBasePath,
  currentRoutePath,
  useRoute,
  useRouteState,
  usePaneTitle,
  useIndexMatch,
  usePathname,
  useSyncPaneRegistry,
  paneOwnerFor,
  usePaneRoute,
  parseUrl,
  buildRouteUrl,
  peekRoute,
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
  PaneLoadScopeContext,
} from "./pane";
export type {
  PaneObject,
  PromoteAction,
  PaneRouteEntry,
  PaneMatch,
  MatchEntry,
  PaneChromeConfig,
  PaneToggleOpts,
  TypeMarker,
  InferParams,
  PaneInternal,
  PaneOptions,
  Hint,
  AnyPane,
  PaneSlot,
  ParsedRoute,
  RouteState,
  PaneOpenMode,
  OpenPaneFn,
  ResolveHook,
  PaneStore,
  PaneHeaderItem,
} from "./pane";
export { setHistoryAdapter, defaultHistoryAdapter } from "./history-sink";
export { appNavSink, type AppNavigator } from "./app-nav-sink";
export type {
  HistoryAdapter,
  LocationChange,
  PaneHistoryState,
  SerializedSlot,
} from "./history-sink";
export { PaneChrome } from "./components/pane-chrome";
export { PaneHeaderCell } from "./components/pane-header-item";
export type {
  PaneHeaderAction,
  PaneHeaderComponent,
} from "./components/pane-header-item";
export {
  definePaneHeaderSlot,
  type PaneHeaderSlot,
  type PaneHeaderSlotOptions,
} from "./header-slot";
export { PaneScroll, type PaneScrollProps } from "./components/pane-scroll";
export { PaneIconAction } from "./components/pane-icon-action";
export { PaneResolveGuard } from "./components/pane-resolve-guard";
export { useRenderSync } from "./use-render-sync";
export { PaneLayoutContext } from "./maximize-context";
export { SurfaceChromeContext } from "./surface-chrome-context";
export type { SurfaceChrome } from "./surface-chrome-context";

export default {
  description: "Unified pane primitive: Pane.define and chrome components.",
  loadBearing: true,
  // The `title` item of every pane header — see `header-slot.ts` for why this is
  // a live array rewritten by each declaration pass rather than a literal.
  contributions: paneHeaderContributions,
  slots: PaneSlots,
} satisfies PluginDefinition;
