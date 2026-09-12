import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * The shared set of cross-app action buttons (Improve, Build, Screenshot, …),
 * plus the view options folded behind the bar's single gear button.
 *
 * Rendered by the global action bar (its docked tab-bar strip and its floating
 * overlay). Plugins contribute here instead of `Shell.Toolbar` so both mounts
 * stay in sync automatically.
 */
export const ActionBar = {
  // Size-owning: both surfaces (agent-manager toolbar + floating bar) render this
  // slot, so declaring `sm` here keeps every action button one consistent height.
  // Contributions should omit `size` and inherit.
  Item: defineRenderSlot<{ component: ComponentType }>({
    controlSize: "sm",
  }),
  /**
   * How the app is shown rather than something to do in it — the surface mode,
   * browser fullscreen, layout editing. These are set once and left alone, so
   * they live in the bar's gear popover instead of each taking a toolbar button.
   *
   * The popover body is a `ControlPanel`, so each contribution renders ONE
   * control-panel row (`ControlPanel.Row` — a switch for an on/off option — or
   * `ControlPanel.Setting` for a value picked from a control).
   */
  ViewOption: defineRenderSlot<{ component: ComponentType }>(),
};
