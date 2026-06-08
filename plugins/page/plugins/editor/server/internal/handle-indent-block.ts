import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { indentBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { notifyBlockChange } from "./notify";

export const handleIndentBlock = implement(indentBlock, async ({ params }) => {
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
    .where(and(parentFilter, lt(_blocks.rank, block.rank)))
    .orderBy(desc(_blocks.rank))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!prevSibling) throw new HttpError(400, "No previous sibling to indent under");

  const newRank = await nextRankUnder(_blocks, _blocks.parentId, prevSibling.id);
  await db
    .update(_blocks)
    .set({ parentId: prevSibling.id, rank: newRank.toJSON(), updatedAt: new Date() })
    .where(eq(_blocks.id, params.id));

  await db
    .update(_blocks)
    .set({ expanded: true, updatedAt: new Date() })
    .where(eq(_blocks.id, prevSibling.id));

  // Indent keeps the block within the same page; pageId is unchanged.
  await notifyBlockChange({ pageId: block.pageId, type: block.type });

  const [row] = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after indent");
  return BlockSchema.parse(row);
});
