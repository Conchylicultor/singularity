import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsiteApps = {
  /**
   * Sections of the applications page at `/website/apps`, rendered
   * top-to-bottom below the page's question. Each section owns its full-width
   * band.
   *
   * The page ships none of its own: the answer to "what will apps evolve into?"
   * is written as contributions here, so writing it costs a new plugin rather
   * than an edit to this one.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>({
    docLabel: (p) => p.label,
  }),
};
