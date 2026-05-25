import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteDocument } from "../../core/endpoints";
import { _documents } from "./tables";
import { documentsLiveResource, blocksLiveResource } from "./resources";

export const handleDeleteDocument = implement(deleteDocument, async ({ params }) => {
  const [row] = await db
    .delete(_documents)
    .where(eq(_documents.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  documentsLiveResource.notify();
  blocksLiveResource.notify();
});
