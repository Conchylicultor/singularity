import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsitePlatform = {
  /**
   * Sections of the Platform pillar page at `/website/platform`, rendered
   * top-to-bottom (hero, architecture, demos, closing links…). Each section
   * owns its full-width band. Demo plugins under `website/demos` contribute
   * their interactive bands here (the pyramid composer, the theme toy).
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>(
    "website.platform.section",
    { docLabel: (p) => p.label },
  ),
};
