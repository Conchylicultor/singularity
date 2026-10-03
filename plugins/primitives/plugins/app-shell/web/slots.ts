import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { SidebarFramingProps } from "../core";

export interface FramingContribution {
  component: ComponentType<SidebarFramingProps>;
}

/**
 * The two places the app's brand is drawn:
 * - `header` — the top of the sidebar, when the app has one: the full brand.
 * - `icon` — the leading edge of the surface's top chrome (the first pane
 *   header, or the chrome toolbar) when the app has no sidebar, sized like the
 *   sidebar toggle that otherwise sits there.
 */
export type AppShellBrandForm = "header" | "icon";

export interface BrandContribution {
  component: ComponentType<{ form: AppShellBrandForm }>;
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
  Framing: defineSlot<FramingContribution>({
    docLabel: () => "Framing",
  }),
  /**
   * The one brand every app shell draws — the shell owns WHERE (sidebar header,
   * or the leading edge of the top chrome without a sidebar), the contributor
   * owns WHAT. A single-contribution slot, so the shell stays ignorant of what
   * a brand is (apps, a launcher) and every app gets the same one by
   * construction: no app passes its own header. With no contribution the shell
   * draws nothing there. Render it through {@link AppShellBrand}.
   */
  Brand: defineSlot<BrandContribution>({
    docLabel: () => "Brand",
  }),
};
