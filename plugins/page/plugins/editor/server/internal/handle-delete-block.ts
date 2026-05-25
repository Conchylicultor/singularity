import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteBlock } from "../../core/endpoints";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";

export const handleDeleteBlock = implement(deleteBlock, async ({ params }) => {
  const [row] = await db
    .delete(_blocks)
    .where(eq(_blocks.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  blocksLiveResource.notify();
});
