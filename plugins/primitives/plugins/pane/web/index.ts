import type { PluginDefinition } from "@core";

export {
  Pane,
  type,
  usePaneMatch,
  useCurrentPane,
  PaneMatchContext,
  PaneDepthContext,
  PaneBasePathContext,
  setBasePath,
  getBasePath,
  stripBasePath,
  useMatchForPath,
  usePathname,
  useSyncPaneRegistry,
  parseUrl,
  buildChainUrl,
  getChain,
  syncChainFromUrl,
  openPane,
  useOpenPane,
} from "./pane";
export type {
  PaneObject,
  PaneMatch,
  MatchEntry,
  PaneChromeConfig,
  TypeMarker,
  InferParams,
  PaneInternal,
  PaneSlot,
} from "./pane";
export { Outlet, PaneLevel } from "./components/outlet";
export { PaneRouter } from "./components/pane-router";
export {
  PaneChrome,
  PaneHistoryButtons,
  PaneActionsSlot,
} from "./components/pane-chrome";
export { PaneIconAction } from "./components/pane-icon-action";
export { PaneLayoutContext } from "./maximize-context";

export default {
  id: "pane",
  name: "Pane",
  description:
    "Unified pane primitive: Pane.define, <Outlet/>, <PaneRouter/>, and chrome components.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
