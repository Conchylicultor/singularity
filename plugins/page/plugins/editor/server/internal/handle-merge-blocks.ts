import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { mergeBlocks } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";

export const handleMergeBlocks = implement(mergeBlocks, async ({ params }) => {
  const [block] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!block) throw new HttpError(404, "Not found");

  const parentFilter = block.parentId === null
    ? isNull(_blocks.parentId)
    : eq(_blocks.parentId, block.parentId!);
  const [prevSibling] = await db
    .select()
    .from(_blocks)
    .where(
      and(
        eq(_blocks.documentId, block.documentId),
        parentFilter,
        lt(_blocks.rank, block.rank),
      ),
    )
    .orderBy(desc(_blocks.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!prevSibling) throw new HttpError(400, "No previous sibling to merge with");

  const prevData = prevSibling.data as Record<string, unknown>;
  const curData = block.data as Record<string, unknown>;
  const prevText = typeof prevData.text === "string" ? prevData.text : "";
  const curText = typeof curData.text === "string" ? curData.text : "";

  await db
    .update(_blocks)
    .set({ data: { ...prevData, text: prevText + curText }, updatedAt: new Date() })
    .where(eq(_blocks.id, prevSibling.id));

  const children = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.parentId, block.id));

  for (const child of children) {
    const newRank = await nextRankUnder(_blocks, _blocks.parentId, prevSibling.id);
    await db
      .update(_blocks)
      .set({ parentId: prevSibling.id, rank: newRank.toJSON(), updatedAt: new Date() })
      .where(eq(_blocks.id, child.id));
  }

  if (children.length > 0) {
    await db
      .update(_blocks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_blocks.id, prevSibling.id));
  }

  await db.delete(_blocks).where(eq(_blocks.id, block.id));

  blocksLiveResource.notify();

  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, prevSibling.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve merged block");
  return BlockSchema.parse(row);
});
