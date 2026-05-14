import type { PluginDefinition } from "@core";

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
  useMatchForPath,
  usePathname,
  useSyncPaneRegistry,
  parseUrl,
  buildChainUrl,
  getChain,
  openPane,
  useOpenPane,
} from "./pane";
export type {
  PaneObject,
  PaneMatch,
  MatchEntry,
  PaneChromeConfig,
  PaneToggleOpts,
  TypeMarker,
  InferParams,
  PaneInternal,
  PaneSlot,
  PaneOpenMode,
} from "./pane";
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
    "Unified pane primitive: Pane.define and chrome components.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
