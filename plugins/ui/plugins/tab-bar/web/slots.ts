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
}

export const TabBar = {
  Variant: defineSlot<TabVariantContribution>("ui.tab-bar.variant", {
    docLabel: (p) => p.label,
  }),
};
