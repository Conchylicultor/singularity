import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  TabsProvider,
  useTabs,
  navigate,
  setSurfaceMode,
  getSurfaceMode,
  useSurfaceMode,
  exitToPreviousMode,
  type TabsApi,
  type NavigateOptions,
} from "./internal/use-tabs";
export { appLinkProps } from "./internal/app-link";
export {
  appPathFor,
  appContributionFor,
  type Tab,
} from "./internal/tabs-store";
export { loadScopePrefixFor } from "./internal/load-scope";
export {
  registerPlacementCapabilities,
  getDefaultPlacement,
  useDefaultPlacement,
  placementIsNewTabFollows,
  placementHasAppThemeScope,
  type PlacementCapabilities,
} from "./internal/placement-registry";

export default {
  description:
    "Tab manager for the app switcher: the open-tab set, focus model, cross-app navigate(), the focused-placement module store, and the surface-written placement-capabilities registry.",
} satisfies PluginDefinition;
