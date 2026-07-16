import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { createBlock, PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/core";
import { textBlock } from "@plugins/page/plugins/text/core";
import { markStory } from "@plugins/apps/plugins/story/plugins/marker/web";

/**
 * Create a new story: a page block, seeded with one empty text block so it is
 * immediately typeable, then upgraded with the story marker so it surfaces in
 * the gallery.
 *
 * Mirrors `pages`' `createPageWithSeed` (the recipe lives in pages' internal dir,
 * not a barrel, so it is replicated here rather than imported). A brand-new page
 * has no content blocks and `BlockEditor` renders nothing typeable in that state,
 * so the seed text block (parented to the page block) is mandatory. The final
 * `markStory` step is what makes this a *story* rather than a plain page.
 *
 * Returns the new page id so the caller can open it in the editor.
 */
export async function createStory(): Promise<string> {
  const page = await fetchEndpoint(
    createBlock,
    {},
    {
      body: {
        parentId: null,
        type: PAGE_BLOCK_TYPE,
        data: { title: "", icon: null },
      },
    },
  );
  await fetchEndpoint(
    createBlock,
    {},
    {
      body: {
        parentId: page.id,
        type: textBlock.type,
        data: textBlock.schema.parse({ text: [] }),
      },
    },
  );
  await markStory(page.id);
  return page.id;
}
