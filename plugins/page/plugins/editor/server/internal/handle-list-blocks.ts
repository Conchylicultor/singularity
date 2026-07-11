import { and, asc, eq, isNull } from "drizzle-orm";
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
  // The page's content forest, sub-page rows included — the SAME set as
  // `blocksLiveResource` and as the reducer's `loadPageBlocks`. This endpoint is
  // the HTTP twin of that resource, so it must not project the forest
  // differently: `(parent_id, rank)` is one ordering space, and a consumer that
  // sees only part of it mints fractional keys that collide with the rows it
  // cannot see. A sub-page is a leaf here — its own content is keyed
  // `page_id = <the sub-page>`, a different partition.
  const rows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, params.pageId), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank));
  return rows.map((r) => BlockSchema.parse(r));
});
