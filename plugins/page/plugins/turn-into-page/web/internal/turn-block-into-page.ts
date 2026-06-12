import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  createBlock,
  textOf,
  PAGE_BLOCK_TYPE,
  type Block,
} from "@plugins/page/plugins/editor/core";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import { pageLinkBlock } from "@plugins/page/plugins/page-link/core";
import { textBlock } from "@plugins/page/plugins/text/core";

/**
 * "Turn into → Page": collapse `block` and its descendant subtree into a new
 * sub-page, leaving a clickable `page-link` where the block sat.
 *
 * Composes existing public editor endpoints — no server-side op needed:
 *   1. Create a `page` block parented to the current page, so it nests as a
 *      sub-page in the sidebar (`computePageId` stamps its `pageId`). The
 *      block's text becomes the page title.
 *   2. Move the block's direct children under the new page. Their subtrees
 *      follow (parentId chain) and the server recomputes each `pageId` to the
 *      new page (`handleBulkMoveBlock` → `recomputePageIdSubtree`). With no
 *      children, seed one empty text block so the page is typeable (same reason
 *      as `createPageWithSeed`).
 *   3. Replace the original block in place with a `page-link` to the new page.
 *
 * This lives outside the editor plugin on purpose: it references the `page-link`
 * and `text` block types, which the editor must not import (would form a cycle).
 */
export async function turnBlockIntoPage(args: {
  block: Block;
  api: BlockEditorAPI;
  /** The page currently being edited; the new page becomes its sub-page. */
  pageId: string;
  /** All blocks of the current page, used to find the block's direct children. */
  blocks: Block[];
  bulkMove: (move: { ids: string[]; parentId: string | null; afterId: string | null }) => void;
}): Promise<void> {
  const { block, api, pageId, blocks, bulkMove } = args;
  const title = textOf(block);
  const childIds = blocks.filter((b) => b.parentId === block.id).map((b) => b.id);

  const page = await fetchEndpoint(
    createBlock,
    {},
    { body: { parentId: pageId, type: PAGE_BLOCK_TYPE, data: { title, icon: null } } },
  );

  if (childIds.length > 0) {
    bulkMove({ ids: childIds, parentId: page.id, afterId: null });
  } else {
    await fetchEndpoint(
      createBlock,
      {},
      { body: { parentId: page.id, type: textBlock.type, data: textBlock.schema.parse({ text: "" }) } },
    );
  }

  api.convertTo(pageLinkBlock.type, pageLinkBlock.schema.parse({ pageId: page.id }));
}
