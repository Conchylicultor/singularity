import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { TabProps } from "../core";

export interface TabVariantContribution {
  id: string;
  label: string;
  /**
   * Dispatch match key — set to the same string as `id`.
   * The render site uses a direct dispatch (see `Tab`) because the slot serves
   * dual duty: listing variants for the picker AND dispatching to the active
   * tab chrome.
   */
  match: string;
  component: ComponentType<TabProps>;
  /**
   * Strip geometry hint read by the host (`AppTabBar`), not per-tab. When true,
   * tabs fill the strip's full height and the strip drops its centering moat
   * (no bottom padding, no `border-b`) so the active tab's bottom edge IS the
   * content seam — the "folder" look (a content-colored notch in the recessed
   * strip, fused with the content below, à la Chrome). When false/undefined the
   * strip centers compact tabs with breathing room and a bottom border (the
   * floating-pill look of chip/underline). This is a strip-level property of the
   * *active* variant — the strip's vertical layout differs between a folder and
   * a floating pill — so a single padded-and-centered strip can't serve both;
   * the host switches on it.
   */
  fillHeight?: boolean;
}

export const TabBar = {
  Variant: defineSlot<TabVariantContribution>("ui.tab-bar.variant", {
    docLabel: (p) => p.label,
  }),
};
