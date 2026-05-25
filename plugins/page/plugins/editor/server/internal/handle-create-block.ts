import { eq } from "drizzle-orm";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _documents, _blocks } from "./tables";
import { blocksLiveResource } from "./resources";

export const handleCreateBlock = implement(createBlock, async ({ params, body }) => {
  const [doc] = await db
    .select({ id: _documents.id })
    .from(_documents)
    .where(eq(_documents.id, params.documentId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!doc) throw new HttpError(404, "Document not found");

  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const rank = body.rank
    ?? await nextRankUnder(_blocks, _blocks.parentId, parentId);
  await db.insert(_blocks).values({
    id,
    documentId: params.documentId,
    parentId,
    type: body.type,
    data: body.data ?? {},
    rank: rank.toJSON(),
  });
  if (parentId) {
    await db
      .update(_blocks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_blocks.id, parentId));
  }
  blocksLiveResource.notify();
  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created block");
  return BlockSchema.parse(row);
});
