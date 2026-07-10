import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import {
  defineFieldExtensions,
  defineItemActions,
} from "@plugins/primitives/plugins/data-view/web";
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
  /**
   * Trailing actions in the page-detail header strip (next to the breadcrumb),
   * e.g. a favorite/star toggle. Generic by design — contributors receive the
   * open page's `pageId` and own their own behavior.
   */
  HeaderActions: defineRenderSlot<{
    component: ComponentType<{ pageId: string }>;
  }>("pages.detail.header-actions"),
};

/**
 * Extension seams the page-tree sidebar DataView exposes:
 *
 *  - `RowActions` — trailing actions on a page-tree row (e.g. delete, star).
 *    Mirrors the task-list `Tasks.TaskActions` pattern so other plugins can add
 *    row actions without editing the row component. Contributors receive the
 *    full page `row` (derive id/title from it) via `ItemActionProps<Block>`.
 *  - `Fields` — extra DataView `FieldDef<Block>[]` injected by other plugins. A
 *    field extension is a *component* (not plain data) so its `value` closure can
 *    capture hook-loaded data — e.g. `starred` reads its own live resource and
 *    yields a `starred` bool field. Contributed fields show up in the Sort pill,
 *    the Filter pill, and as columns/chips for free, so "Favorites" is just a
 *    filtered `list` view over the `starred` field rather than a bespoke sidebar.
 */
export const PageTree = {
  RowActions: defineItemActions<Block>("pages.tree.row-actions"),
  Fields: defineFieldExtensions<Block>("pages.tree.fields"),
};
