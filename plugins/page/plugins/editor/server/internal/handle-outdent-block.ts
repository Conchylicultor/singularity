import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { outdentBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";

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

  const grandparentFilter = parent.parentId === null
    ? isNull(_blocks.parentId)
    : eq(_blocks.parentId, parent.parentId!);
  const [nextSiblingOfParent] = await db
    .select()
    .from(_blocks)
    .where(
      and(
        eq(_blocks.documentId, block.documentId),
        grandparentFilter,
        gt(_blocks.rank, parent.rank),
      ),
    )
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

  blocksLiveResource.notify({ documentId: block.documentId });
  await blocksChanged.emit({ documentId: block.documentId });

  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after outdent");
  return BlockSchema.parse(row);
});
