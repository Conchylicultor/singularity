import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listBlocks } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";

export const handleListBlocks = implement(listBlocks, async ({ params }) => {
  const [page] = await db
    .select({ id: _blocks.id })
    .from(_blocks)
    .where(and(eq(_blocks.id, params.pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!page) throw new HttpError(404, "Page not found");
  const rows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, params.pageId), ne(_blocks.type, PAGE_BLOCK_TYPE)))
    .orderBy(asc(_blocks.rank));
  return rows.map((r) => BlockSchema.parse(r));
});
