import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { BreadcrumbSeparatorProps } from "../core";

export interface BreadcrumbSeparatorContribution {
  component: ComponentType<BreadcrumbSeparatorProps>;
}

/**
 * Slot a UI plugin contributes the mark drawn between two crumbs into.
 *
 * The trail renders the single contributed separator (whose own region
 * dispatches to the active variant — chevron / slash), so this is a plain
 * `defineSlot` rather than a render slot: the separator is painted once per gap
 * inside the trail's own flow, not mapped as a list of cells. With no
 * contribution the trail falls back to its inline default chevron, which is
 * what the `chevron` variant draws — so loading the variant plugin changes
 * nothing until the user picks the other one.
 */
export const BreadcrumbSlots = {
  Separator: defineSlot<BreadcrumbSeparatorContribution>({
    docLabel: () => "Separator",
  }),
};
