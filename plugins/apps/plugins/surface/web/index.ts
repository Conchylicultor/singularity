import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Apps,
  getFocusedPlacement,
  setFocusedTabPlacement,
} from "@plugins/apps/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { SurfaceBody } from "./components/surface-body";
import {
  TabBarPlacementControl,
  ActionBarPlacementControl,
} from "./components/placement-control";

export default {
  description:
    "Per-tab surface: renders every open tab at once positioned by its own placement (docked / floating / solo). Owns the multi-placement body, floating window chrome, geometry store, and the 3-way placement control + Esc-to-exit-solo.",
  contributions: [
    // The single body that lays out every tab by its per-tab placement.
    Apps.Surface({ component: SurfaceBody }),
    // The in-strip placement control, next to the tab bar `+`.
    Apps.TabBarActions({ id: "placement-control", component: TabBarPlacementControl }),
    // The persistent action-bar control (agent-manager toolbar + floating bar),
    // reachable in every app including a solo (fullscreen) surface.
    ActionBar.Item({ id: "placement", component: ActionBarPlacementControl }),
    // Esc exits a solo (fullscreen) tab back to docked.
    defineShortcut({
      id: "surface.exit-solo",
      keys: "Escape",
      label: "Exit fullscreen",
      group: "Surface",
      when: () => getFocusedPlacement() === "solo",
      handler: () => setFocusedTabPlacement("docked"),
    }),
  ],
} satisfies PluginDefinition;
