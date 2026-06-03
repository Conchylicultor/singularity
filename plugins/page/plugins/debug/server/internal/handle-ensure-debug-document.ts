import { eq } from "drizzle-orm";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  _documents,
  _blocks,
  documentsLiveResource,
  blocksLiveResource,
  DocumentSchema,
} from "@plugins/page/plugins/editor/server";
import { textBlock } from "@plugins/page/plugins/text/core";
import { ensureDebugDocument } from "../../core";

const DEBUG_DOC_ID = "doc-debug";
const DEBUG_SEED_BLOCK_ID = "block-doc-debug-seed";

export const handleEnsureDebugDocument = implement(ensureDebugDocument, async () => {
  // Ensure the document exists. Fixed id + ON CONFLICT DO NOTHING makes this
  // idempotent across concurrent calls and multiple browser tabs. `rank` is
  // notNull on page_documents; the debug doc is a root with a fixed first rank.
  const docRank = await nextRankUnder(_documents, _documents.parentId, null);
  await db
    .insert(_documents)
    .values({ id: DEBUG_DOC_ID, title: "Debug Document", rank: docRank.toJSON() })
    .onConflictDoNothing();
  documentsLiveResource.notify();

  // Seed one empty text block only when the document has none — otherwise the
  // editor renders an un-typeable empty surface (the first block can only be
  // created by splitting an existing one). The fixed seed-block id keeps
  // concurrent ensures from inserting duplicates.
  const existing = await db
    .select({ id: _blocks.id })
    .from(_blocks)
    .where(eq(_blocks.documentId, DEBUG_DOC_ID))
    .limit(1);
  if (existing.length === 0) {
    const rank = await nextRankUnder(_blocks, _blocks.parentId, null);
    await db
      .insert(_blocks)
      .values({
        id: DEBUG_SEED_BLOCK_ID,
        documentId: DEBUG_DOC_ID,
        parentId: null,
        type: textBlock.type,
        data: textBlock.schema.parse({ text: "" }),
        rank: rank.toJSON(),
      })
      .onConflictDoNothing();
    blocksLiveResource.notify({ documentId: DEBUG_DOC_ID });
  }

  const [row] = await db
    .select()
    .from(_documents)
    .where(eq(_documents.id, DEBUG_DOC_ID))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to ensure debug document");
  return DocumentSchema.parse(row);
});
