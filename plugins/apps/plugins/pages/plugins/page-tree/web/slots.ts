import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * Extensible host for sections rendered below a page's editor in the
 * page-detail pane. Future plugins (e.g. Phase 2 backlinks) contribute a
 * section component that receives the page's `documentId`.
 */
export const PageDetail = {
  Section: defineRenderSlot<{
    component: ComponentType<{ documentId: string }>;
  }>("pages.detail.section"),
};
