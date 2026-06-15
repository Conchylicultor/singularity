import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { SurfaceBody } from "./components/surface-body";
import { ActionBarPlacementControl } from "./components/placement-control";

export {
  Surface,
  PlacementStyleProvider,
  usePlacementStyle,
  type PlacementDef,
  type PlacementChromeProps,
  type PlacementStyleApi,
} from "./slots";

export default {
  description:
    "Generic per-tab surface dispatcher: renders every open tab at once positioned by its own placement, dispatched through the Surface.Placement registry. Owns the multi-placement body and the placement control; each placement (docked / floating / solo) is a self-contained sub-plugin.",
  contributions: [
    // The single body that lays out every tab by its per-tab placement.
    Apps.Surface({ component: SurfaceBody }),
    // The placement control, contributed as a shared action-bar item so it
    // renders in both the docked tab-bar strip and the floating overlay.
    ActionBar.Item({ id: "placement-control", component: ActionBarPlacementControl }),
  ],
} satisfies PluginDefinition;
