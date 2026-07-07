import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsiteApps = {
  /**
   * Sections of the Apps pillar page at `/website/apps`, rendered
   * top-to-bottom (hero, app showcase, demos, closing links…). Each section
   * owns its full-width band. Demo plugins under `website/demos` contribute
   * their interactive bands here.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>(
    "website.apps.section",
    { docLabel: (p) => p.label },
  ),
};
