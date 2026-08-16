import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import {
  defineFieldExtensions,
  defineItemActions,
} from "@plugins/primitives/plugins/data-view/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";

/**
 * Sections rendered below a page's editor in the page-detail pane. The host
 * paints each contribution as a collapsible `SectionCard`, so a section supplies
 * a `label` and a body and never its own title.
 *
 * A section that does not apply to the open page declares `useAvailable` — it
 * must NOT `return null` from its body, which would leave an empty titled card
 * on every page (that is exactly what "Linked from" and "Story" would do).
 *
 * The factory id is `"pages.detail"` — NOT `"pages"` — because the emitted slot
 * id is `` `${id}.section` `` verbatim and `reorderDirectiveDescriptor` uses a
 * slot id verbatim as its config_v2 config name. `pages.detail.section` is what
 * this pane's persisted section order is already keyed by.
 */
const pageDetailSections = defineDetailSections<{ pageId: string }>(
  "pages.detail",
  // `PageContentColumn` already places sections at the page's block inset — the
  // documented invariant that the title, icon, and section list share one
  // content edge with the blocks (see `page/editor/internal/page-column.ts`).
  // The stack must not inset them a second time or the cards would sit visibly
  // narrower than the text above them.
  { inset: "none" },
);

export const PageDetail = {
  Section: pageDetailSections.Section,
  /** Renders every contributed section. Mounted by `pageDetailPane`. */
  Host: pageDetailSections.Host,
  /**
   * Trailing actions in the page-detail header strip (next to the breadcrumb),
   * e.g. a favorite/star toggle. Generic by design — contributors receive the
   * open page's `pageId` and own their own behavior. NOT a detail section: this
   * is page-header chrome, always visible and never collapsible.
   */
  HeaderActions: defineRenderSlot<{
    component: ComponentType<{ pageId: string }>;
  }>("pages.detail.header-actions"),
  /**
   * A widget floating OVER the open page — an outline rail, a reading-progress
   * indicator. The host gives it a positioning context and nothing else: a
   * contribution owns its own placement inside that box (typically a `Pin`).
   *
   * Neither of the other two seams has this shape. `Section` is an in-flow card
   * *below* the editor, and `HeaderActions` is a button *in* the header strip;
   * an overlay is on top of the page and is not part of its flow at all.
   *
   * The host's positioning box wraps the pane, deliberately outside the pane's
   * one scroller — an absolutely-positioned child of a scroller scrolls away
   * with the document, which is the one thing a "where am I" indicator must not
   * do. Mirrors `JsonlViewer.Overlay`, the same seam on the conversation
   * transcript.
   */
  Overlay: defineRenderSlot<{
    component: ComponentType<{ pageId: string }>;
  }>("pages.detail.overlay", { docLabel: (p) => p.id }),
};

/**
 * Extension seams the page-tree sidebar DataView exposes:
 *
 *  - `RowActions` — trailing actions on a page-tree row (e.g. delete, star).
 *    Mirrors the task-list `Tasks.TaskActions` pattern so other plugins can add
 *    row actions without editing the row component. Contributors receive the
 *    full page `row` (derive id/title from it) via `ItemActionProps<PageRow>`.
 *  - `Fields` — extra DataView `FieldDef<PageRow>[]` injected by other plugins. A
 *    field extension is a *component* (not plain data) so its `value` closure can
 *    capture hook-loaded data — e.g. `starred` reads its own live resource and
 *    yields a `starred` bool field. Contributed fields show up in the Sort pill,
 *    the Filter pill, and as columns/chips for free, so "Favorites" is just a
 *    filtered `list` view over the `starred` field rather than a bespoke sidebar.
 */
export const PageTree = {
  RowActions: defineItemActions<PageRow>("pages.tree.row-actions"),
  Fields: defineFieldExtensions<PageRow>("pages.tree.fields"),
};
