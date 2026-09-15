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
   * Strip geometry read by the host (`AppTabBar`), not per-tab — the strip's
   * vertical layout differs between the variants, so one strip can't serve all
   * of them and the host switches on the ACTIVE variant's value:
   *
   * - `padded` (default) — compact tabs centred with breathing room above a
   *   bottom border: the floating-pill look (chip).
   * - `flush` — tabs fill the strip's full height and the bottom border stays,
   *   so a mark on a tab's bottom edge lands ON that border: the underline look.
   * - `folder` — tabs fill the full height and the strip drops its bottom
   *   border too, so the active tab's bottom edge IS the content seam: a
   *   content-coloured notch fused with the content below, à la Chrome.
   */
  strip?: TabStrip;
}

/** How a tab variant wants the strip laid out — see {@link TabVariantContribution.strip}. */
export type TabStrip = "padded" | "flush" | "folder";

export const TabBar = {
  Variant: defineSlot<TabVariantContribution>({
    docLabel: (p) => p.label,
  }),
};
