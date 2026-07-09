import { defineBlock, PAGE_BLOCK_TYPE, PageDataSchema } from "@plugins/page/plugins/editor/core";

/**
 * The sub-page block: a `type="page"` row rendered INLINE in its parent page's
 * content editor, exactly as Notion does. It is not a reference to a page — it
 * IS the page. (`page-link` remains the reference block: a `[[ ]]`-style pointer
 * at an arbitrary page.)
 *
 * Deliberately declares **no `label`** — `useInsertableBlocks` only offers block
 * types that carry one, so a page row can never be created from the slash menu,
 * the `+` gutter, or the "Turn into" list. Minting a sub-page means minting its
 * `page_id` partition and restamping the subtree, which only the server's
 * turn-into-page op knows how to do.
 */
export const subPageBlock = defineBlock({
  type: PAGE_BLOCK_TYPE,
  schema: PageDataSchema,
});
