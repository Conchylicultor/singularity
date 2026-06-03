import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { moveBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";

export const handleMoveBlock = implement(moveBlock, async ({ params, body }) => {
  if (body.parentId === params.id) {
    throw new HttpError(400, "Cannot parent a block to itself");
  }
  const [updated] = await db
    .update(_blocks)
    .set({
      parentId: body.parentId,
      rank: body.rank.toJSON(),
      updatedAt: new Date(),
    })
    .where(eq(_blocks.id, params.id))
    .returning({ id: _blocks.id, documentId: _blocks.documentId });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) throw new HttpError(404, "Not found");
  if (body.parentId) {
    await db
      .update(_blocks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_blocks.id, body.parentId));
  }
  blocksLiveResource.notify({ documentId: updated.documentId });
  await blocksChanged.emit({ documentId: updated.documentId });
  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after move");
  return BlockSchema.parse(row);
});
