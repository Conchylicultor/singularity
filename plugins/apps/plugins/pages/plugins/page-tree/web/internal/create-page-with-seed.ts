import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { createDocument, createBlock } from "@plugins/page/plugins/editor/core";
import { textBlock } from "@plugins/page/plugins/text/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

/**
 * Create a new page and seed it with one empty text block so it is immediately
 * typeable.
 *
 * A brand-new document has zero blocks, and `BlockEditor` renders nothing
 * typeable in that state — the first block can only be created by splitting an
 * existing one. So every page must start with at least one empty text block.
 *
 * This lives in the consumer (the pages app) rather than `createDocument`'s
 * server handler on purpose: the editor plugin must not import the text block
 * (`@plugins/page/plugins/text`), since that would create an editor↔text plugin
 * cycle. The pages app may depend on both editor and text (acyclic), so it is
 * the right place to combine them. Centralizing here keeps every create path
 * (root "New Page", per-row "Add child") seeding consistently.
 *
 * Returns the new page id so the caller (TreeList's `onCreate`) can open it.
 */
export async function createPageWithSeed(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string> {
  const doc = await fetchEndpoint(
    createDocument,
    {},
    { body: { parentId: args.parentId, rank: args.rank } },
  );
  await fetchEndpoint(
    createBlock,
    { documentId: doc.id },
    { body: { type: textBlock.type, data: textBlock.schema.parse({ text: "" }) } },
  );
  return doc.id;
}
