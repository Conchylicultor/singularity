import { defineHistorySource } from "@plugins/history/plugins/engine/server";
import {
  serializePageContent,
  restorePageContent,
  type PageContentSnapshot,
} from "@plugins/page/plugins/editor/server";
import { writeBlockTexts } from "@plugins/page/plugins/block-text-write/server";

/**
 * Pages history source. Serialize/restore go entirely through the editor's
 * public, domain-neutral page-content API (`serializePageContent` /
 * `restorePageContent`) — this consumer never touches the `page_blocks` table.
 *
 * The stored snapshot IS the editor's `PageContentSnapshot` (page metadata +
 * flat content rows with ids), so the web preview can rebuild the tree and diff
 * by stable id.
 *
 * `restore` changes the page by block IDENTITY: a block the page and the
 * version share keeps its id and has its content doc edited to the version's
 * text, a block deleted since comes back from the trash as itself, and a block
 * created since is trashed. Nothing is hard-deleted, so the engine's
 * "Before restore" snapshot (taken just before this runs) undoes it the same
 * way. Open editors stay mounted: structure arrives through the blocks push,
 * text as an ordinary content-doc merge. The text half is written through
 * `writeBlockTexts`, the one server-side text channel, which the editor takes
 * as a parameter because it cannot import it.
 */
export const pageHistorySource = defineHistorySource({
  id: "pages",
  serialize: async (pageId) => {
    const snapshot = await serializePageContent(pageId);
    if (!snapshot) return null; // page deleted during the debounce window — skip
    return { snapshot, label: snapshot.page.title || "Untitled" };
  },
  restore: (pageId, snapshot) =>
    restorePageContent(pageId, snapshot as PageContentSnapshot, {
      writeTexts: writeBlockTexts,
    }),
});
