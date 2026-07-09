import { eq } from "drizzle-orm";
import { nextRankUnder, rankAfterSibling } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { computePageId } from "./page-id";
import { notifyBlockChange } from "./notify";

export const handleCreateBlock = implement(createBlock, async ({ body }) => {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let parentId = body.parentId ?? null;
  let rank;

  if (body.afterId) {
    // Insert immediately after an existing block: same parent, rank between it
    // and its next sibling at that parent (same shape as the reducer's insert).
    const [after] = await db
      .select()
      .from(_blocks)
      .where(eq(_blocks.id, body.afterId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!after) throw new HttpError(404, "Block not found");

    parentId = after.parentId;
    rank = await rankAfterSibling(
      _blocks,
      _blocks.parentId,
      parentId,
      body.afterId,
      _blocks.id,
    );
  } else {
    rank = await nextRankUnder(_blocks, _blocks.parentId, parentId);
  }

  const pageId = await computePageId(parentId);
  await db.insert(_blocks).values({
    id,
    pageId,
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
  await notifyBlockChange({ pageId, type: body.type, blockId: id });
  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created block");
  return BlockSchema.parse(row);
});
