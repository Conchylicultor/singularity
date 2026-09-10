import { and, asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listBlocks } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { liveBlocks } from "./live-blocks";
import { BLOCK_WIRE_COLUMNS } from "./wire-columns";

export const handleListBlocks = implement(listBlocks, async ({ params }) => {
  const [page] = await db
    .select({ id: liveBlocks.id })
    // A trashed page is not addressable (404, like an unknown id).
    .from(liveBlocks)
    .where(
      and(
        eq(liveBlocks.id, params.pageId),
        eq(liveBlocks.type, PAGE_BLOCK_TYPE),
      ),
    )
    .limit(1);
  if (!page) throw new HttpError(404, "Page not found");
  // The page's content forest, sub-page rows included — the SAME set as
  // `blocksLiveResource` and as the reducer's `loadPageBlocks`. This endpoint is
  // the HTTP twin of that resource, so it must not project the forest
  // differently: `(parent_id, rank)` is one ordering space, and a consumer that
  // sees only part of it mints fractional keys that collide with the rows it
  // cannot see. A sub-page is a leaf here — its own content is keyed
  // `page_id = <the sub-page>`, a different partition.
  const rows = await db
    .select(BLOCK_WIRE_COLUMNS)
    .from(liveBlocks)
    .where(eq(liveBlocks.pageId, params.pageId))
    .orderBy(asc(liveBlocks.rank));
  return rows.map((r) => BlockSchema.parse(r));
});
