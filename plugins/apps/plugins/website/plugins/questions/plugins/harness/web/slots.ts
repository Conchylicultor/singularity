import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsiteHarness = {
  /**
   * Sections of the engineering page at `/website/harness`, rendered
   * top-to-bottom below the page's question. Each section owns its full-width
   * band.
   *
   * The page ships none of its own: the answer to "what does software
   * engineering look like when no human reviews the code?" is written as
   * contributions here, so writing it costs a new plugin rather than an edit to
   * this one.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>({
    docLabel: (p) => p.label,
  }),
};
