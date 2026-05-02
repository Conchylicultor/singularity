import type { PluginDefinition } from "@core";

export {
  Pane,
  type,
  usePaneMatch,
  useCurrentPane,
  PaneMatchContext,
  PaneDepthContext,
  useMatchForPath,
  usePathname,
  useSyncPaneRegistry,
} from "./pane";
export type {
  PaneObject,
  PaneMatch,
  MatchEntry,
  PaneChromeConfig,
  TypeMarker,
  InferParams,
  PaneInternal,
} from "./pane";
export { Outlet, PaneLevel } from "./components/outlet";
export { PaneRouter } from "./components/pane-router";
export {
  PaneChrome,
  PaneHistoryButtons,
  PaneActionsSlot,
} from "./components/pane-chrome";
export { PaneIconAction } from "./components/pane-icon-action";

export default {
  id: "pane",
  name: "Pane",
  description:
    "Unified pane primitive: Pane.define, <Outlet/>, <PaneRouter/>, and chrome components.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
