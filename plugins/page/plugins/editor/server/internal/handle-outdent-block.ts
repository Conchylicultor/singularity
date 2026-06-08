import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { outdentBlock } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { notifyBlockChange } from "./notify";

export const handleOutdentBlock = implement(outdentBlock, async ({ params }) => {
  const [block] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!block) throw new HttpError(404, "Not found");

  if (!block.parentId) {
    throw new HttpError(400, "Already at top level");
  }

  const [parent] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, block.parentId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!parent) throw new HttpError(404, "Parent block not found");

  // Content's top level is "directly under the page". Outdenting past that would
  // escape the page into its parent's content — disallow.
  if (parent.type === PAGE_BLOCK_TYPE) {
    throw new HttpError(400, "Already at top level");
  }

  const grandparentFilter = parent.parentId === null
    ? isNull(_blocks.parentId)
    : eq(_blocks.parentId, parent.parentId!);
  const [nextSiblingOfParent] = await db
    .select()
    .from(_blocks)
    .where(and(grandparentFilter, gt(_blocks.rank, parent.rank)))
    .orderBy(asc(_blocks.rank))
    .limit(1);

  const parentRank = Rank.from(parent.rank as unknown as string);
  const nextRank = nextSiblingOfParent
    ? Rank.from(nextSiblingOfParent.rank as unknown as string)
    : null;
  const newRank = Rank.between(parentRank, nextRank);

  await db
    .update(_blocks)
    .set({ parentId: parent.parentId, rank: newRank.toJSON(), updatedAt: new Date() })
    .where(eq(_blocks.id, params.id));

  // The grandparent is within the same page, so pageId is unchanged.
  await notifyBlockChange({ pageId: block.pageId, type: block.type });

  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after outdent");
  return BlockSchema.parse(row);
});
