import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { SidebarFramingProps } from "../core";

export interface FramingContribution {
  component: ComponentType<SidebarFramingProps>;
}

/**
 * Slot a UI framing plugin contributes the sidebar/main wrapper into. app-shell
 * renders the single contributed framing directly (which internally dispatches
 * to its own per-app variants), so this is a plain `defineSlot` — not a render
 * slot: the framing wraps the sidebar + main and needs structural props
 * (header/sidebarContent/body), which the `.Render` map-each pattern can't pass.
 * With no contribution, app-shell falls back to its inline default flush framing.
 */
export const AppShell = {
  Framing: defineSlot<FramingContribution>("app-shell.framing", {
    docLabel: () => "Framing",
  }),
};
