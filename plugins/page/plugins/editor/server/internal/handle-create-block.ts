import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
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
    // and its next sibling at that parent. Mirrors handle-split-block's logic.
    const [after] = await db
      .select()
      .from(_blocks)
      .where(eq(_blocks.id, body.afterId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!after) throw new HttpError(404, "Block not found");

    parentId = after.parentId;
    const parentFilter = after.parentId === null
      ? isNull(_blocks.parentId)
      : eq(_blocks.parentId, after.parentId);
    const [nextSibling] = await db
      .select()
      .from(_blocks)
      .where(and(parentFilter, gt(_blocks.rank, after.rank)))
      .orderBy(asc(_blocks.rank))
      .limit(1);

    const afterRank = Rank.from(after.rank as unknown as string);
    const nextRank = nextSibling
      ? Rank.from(nextSibling.rank as unknown as string)
      : null;
    rank = Rank.between(afterRank, nextRank);
  } else {
    rank = body.rank
      ?? await nextRankUnder(_blocks, _blocks.parentId, parentId);
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
  await notifyBlockChange({ pageId, type: body.type });
  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created block");
  return BlockSchema.parse(row);
});
