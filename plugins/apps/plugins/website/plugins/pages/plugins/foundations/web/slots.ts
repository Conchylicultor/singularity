import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const WebsiteFoundations = {
  /**
   * Sections of the foundations page at `/website/foundations`, rendered
   * top-to-bottom below the page's heading. Each section owns its full-width
   * band.
   *
   * The page ships none of its own: how equin is built — the framework, the
   * harness, the plugin system — is written as contributions here, so writing
   * it costs a new plugin rather than an edit to this one.
   */
  Section: defineRenderSlot<{ label: string; component: ComponentType }>({
    docLabel: (p) => p.label,
  }),
};
