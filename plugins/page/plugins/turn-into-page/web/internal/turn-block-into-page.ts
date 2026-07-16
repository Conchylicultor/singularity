import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { turnIntoPage, textOf, type Block } from "@plugins/page/plugins/editor/core";
import { textBlock } from "@plugins/page/plugins/text/core";

/**
 * "Turn into → Page": convert `block` into a sub-page in place. The block keeps
 * its id and its position in the sibling ordering — it simply becomes the `page`
 * row, which the editor renders as an inline sub-page. Its descendants follow
 * (the server re-scopes their `page_id`), and its text becomes the page title.
 *
 * One atomic server op. There is no separate `page-link` row: with inline
 * sub-pages the page row IS the link. (`page-link` survives as the *reference*
 * block — a `[[ ]]` link to an arbitrary page — which is semantically a
 * different thing from an in-place child.)
 *
 * `seedChild` is passed from here rather than chosen server-side because the
 * editor plugin must not import a concrete block type
 * (`@plugins/page/plugins/text`) — that would form an editor↔text cycle. This
 * plugin may depend on both, so it is the right place to combine them, exactly
 * as `createPageWithSeed` does for the sidebar's create paths.
 */
export async function turnBlockIntoPage(args: { block: Block }): Promise<void> {
  const { block } = args;
  await fetchEndpoint(
    turnIntoPage,
    { id: block.id },
    {
      body: {
        title: textOf(block),
        seedChild: {
          type: textBlock.type,
          data: textBlock.schema.parse({ text: [] }),
        },
      },
    },
  );
}
