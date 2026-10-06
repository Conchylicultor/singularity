import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { Hook } from "@plugins/framework/plugins/hook-value/core";
import type { Activity } from "@plugins/primitives/plugins/css/plugins/activity-ring/web";
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
  /**
   * Background work the COLLAPSED bar should show while every item is hidden:
   * each contribution's hook answers what its work is doing right now (`null`
   * when nothing). The bar merges them into the ring around its health dot —
   * any `running` spins it, else any `failed` breaks it — and appends the
   * labels to the dot's tooltip. A plain `defineSlot`: the bar owns the merge,
   * so there is no order for a user to curate.
   *
   * ```ts
   * ActionBar.Activity({ id: "build", useActivity: useBuildActivity })
   * ```
   */
  Activity: defineSlot<{
    id: string;
    useActivity: Hook<() => Activity | null>;
  }>({ docLabel: (c) => c.id }),
  /**
   * Compact chips shown beside the COLLAPSED bar's health dot — something the
   * user should act on even while the bar is closed (Reload). A contribution
   * renders `null` when it has nothing to say. Hidden while the bar is open:
   * the expanded row shows the full items, which carry the same action.
   */
  Glance: defineRenderSlot<{ component: ComponentType }>({
    controlSize: "sm",
  }),
};
