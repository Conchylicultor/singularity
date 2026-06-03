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
  Item: defineRenderSlot<{ component: ComponentType }>("action-bar.item"),
};
