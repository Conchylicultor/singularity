import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

/**
 * Extensible host for sections rendered below a page's editor in the
 * page-detail pane. Future plugins (e.g. Phase 2 backlinks) contribute a
 * section component that receives the page's `pageId`.
 */
export const PageDetail = {
  Section: defineRenderSlot<{
    component: ComponentType<{ pageId: string }>;
  }>("pages.detail.section"),
};

/**
 * Extensible host for trailing actions on a page-tree row (e.g. delete).
 * Mirrors the task-list `Tasks.TaskActions` pattern so other plugins can add
 * row actions without editing the row component. Contributors receive the
 * page's id and title.
 */
export const PageTree = {
  RowActions: defineRenderSlot<{
    component: ComponentType<{ pageId: string; title: string }>;
  }>("pages.tree.row-actions"),
};
