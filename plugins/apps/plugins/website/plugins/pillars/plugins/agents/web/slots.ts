import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsiteAgents = {
  /**
   * Sections of the Agents pillar page at `/website/agents`, rendered
   * top-to-bottom (hero, how-it-works, demos, closing links…). Each section
   * owns its full-width band. Demo plugins under `website/demos` contribute
   * their interactive bands here.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>(
    "website.agents.section",
    { docLabel: (p) => p.label },
  ),
};
