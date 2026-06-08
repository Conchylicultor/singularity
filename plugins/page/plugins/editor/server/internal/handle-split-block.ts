import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { splitBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { computePageId } from "./page-id";
import { notifyBlockChange } from "./notify";

export const handleSplitBlock = implement(splitBlock, async ({ params, body }) => {
  const [block] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!block) throw new HttpError(404, "Not found");

  const data = block.data as Record<string, unknown>;
  const text = typeof data.text === "string" ? data.text : "";
  const position = Math.min(body.position, text.length);
  const beforeText = text.slice(0, position);
  const afterText = text.slice(position);

  await db
    .update(_blocks)
    .set({ data: { ...data, text: beforeText }, updatedAt: new Date() })
    .where(eq(_blocks.id, params.id));

  let newParentId: string | null;
  let newType: string;
  let newRank: Rank;
  if (body.asChild) {
    // Nest the split-off content as the original's FIRST child, before any
    // existing child, and force the original open so the new child is visible.
    const [firstChild] = await db
      .select()
      .from(_blocks)
      .where(eq(_blocks.parentId, block.id))
      .orderBy(asc(_blocks.rank))
      .limit(1);
    const firstChildRank = firstChild
      ? Rank.from(firstChild.rank as unknown as string)
      : null;
    newParentId = block.id;
    newType = body.childType ?? block.type;
    newRank = Rank.between(null, firstChildRank);
    await db
      .update(_blocks)
      .set({ expanded: true, updatedAt: new Date() })
      .where(eq(_blocks.id, params.id));
  } else {
    const parentFilter = block.parentId === null
      ? isNull(_blocks.parentId)
      : eq(_blocks.parentId, block.parentId!);
    const [nextSibling] = await db
      .select()
      .from(_blocks)
      .where(and(parentFilter, gt(_blocks.rank, block.rank)))
      .orderBy(asc(_blocks.rank))
      .limit(1);

    const currentRank = Rank.from(block.rank as unknown as string);
    const nextRank = nextSibling
      ? Rank.from(nextSibling.rank as unknown as string)
      : null;
    newParentId = block.parentId;
    newType = block.type;
    newRank = Rank.between(currentRank, nextRank);
  }

  const newId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newPageId = await computePageId(newParentId);
  await db.insert(_blocks).values({
    id: newId,
    pageId: newPageId,
    parentId: newParentId,
    type: newType,
    data: { ...data, text: afterText },
    rank: newRank.toJSON(),
  });

  await notifyBlockChange({ pageId: block.pageId, type: block.type });

  const [origRow] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  const [newRow] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, newId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!origRow || !newRow) throw new HttpError(500, "Failed to retrieve blocks after split");
  return { original: BlockSchema.parse(origRow), created: BlockSchema.parse(newRow) };
});
