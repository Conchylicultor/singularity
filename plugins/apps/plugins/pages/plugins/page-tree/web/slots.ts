import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { Block } from "@plugins/page/plugins/editor/core";

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
 * full page `row` (derive id/title from it) via `ItemActionProps<Block>`.
 */
export const PageTree = {
  RowActions: defineItemActions<Block>("pages.tree.row-actions"),
};
