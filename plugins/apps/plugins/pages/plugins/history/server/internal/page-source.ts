import { defineHistorySource } from "@plugins/history/plugins/engine/server";
import {
  serializePageContent,
  replacePageContent,
  type PageContentSnapshot,
} from "@plugins/page/plugins/editor/server";

/**
 * Pages history source. Serialize/restore go entirely through the editor's
 * public, domain-neutral page-content API (`serializePageContent` /
 * `replacePageContent`) — this consumer never touches the `page_blocks` table.
 *
 * The stored snapshot IS the editor's `PageContentSnapshot` (page metadata +
 * flat content rows with ids), so the web preview can rebuild the tree and diff
 * by stable id. `restore` is a reversible replace: the engine snapshots current
 * state first ("Before restore"), then calls this; the editor's replace emits
 * the post-commit `blocksChanged` push so open editors re-hydrate live.
 */
export const pageHistorySource = defineHistorySource({
  id: "pages",
  serialize: async (pageId) => {
    const snapshot = await serializePageContent(pageId);
    if (!snapshot) return null; // page deleted during the debounce window — skip
    return { snapshot, label: snapshot.page.title || "Untitled" };
  },
  restore: async (pageId, snapshot) => {
    await replacePageContent(pageId, snapshot as PageContentSnapshot);
  },
});
