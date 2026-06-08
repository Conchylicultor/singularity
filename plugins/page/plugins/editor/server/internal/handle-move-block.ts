import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { moveBlock } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { pagesLiveResource, blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { recomputePageIdSubtree } from "./page-id";

export const handleMoveBlock = implement(moveBlock, async ({ params, body }) => {
  if (body.parentId === params.id) {
    throw new HttpError(400, "Cannot parent a block to itself");
  }
  const [before] = await db
    .select({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type })
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!before) throw new HttpError(404, "Not found");

  await db
    .update(_blocks)
    .set({
      parentId: body.parentId,
      rank: body.rank.toJSON(),
      updatedAt: new Date(),
    })
    .where(eq(_blocks.id, params.id));
  // Reparenting may move the block (and its subtree) into a different page.
  await recomputePageIdSubtree(params.id);
  if (body.parentId) {
    await db
      .update(_blocks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_blocks.id, body.parentId));
  }

  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after move");

  // Notify both the old and the (possibly new) page scope, deduped.
  const affected = new Set<string>();
  if (before.pageId !== null) affected.add(before.pageId);
  if (row.pageId !== null) affected.add(row.pageId);
  for (const pageId of affected) {
    blocksLiveResource.notify({ pageId });
    await blocksChanged.emit({ pageId });
  }
  // Moving a page reorders / reparents the sidebar tree.
  if (before.type === PAGE_BLOCK_TYPE) pagesLiveResource.notify();

  return BlockSchema.parse(row);
});
