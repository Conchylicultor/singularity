import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * The shared set of cross-app action buttons (Improve, Build, Screenshot, …).
 *
 * Single source of truth rendered by two surfaces: the agent-manager toolbar
 * (which reuses it via a single `Shell.Toolbar` entry) and the floating action
 * bar. Plugins contribute their toolbar buttons here instead of `Shell.Toolbar`
 * so both surfaces stay in sync automatically.
 */
export const ActionBar = {
  // Size-owning: both surfaces (agent-manager toolbar + floating bar) render this
  // slot, so declaring `sm` here keeps every action button one consistent height.
  // Contributions should omit `size` and inherit.
  Item: defineRenderSlot<{ component: ComponentType }>("action-bar.item", {
    controlSize: "sm",
  }),
};
