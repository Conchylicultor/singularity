import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listBlocks } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _documents, _blocks } from "./tables";

export const handleListBlocks = implement(listBlocks, async ({ params }) => {
  const [doc] = await db
    .select({ id: _documents.id })
    .from(_documents)
    .where(eq(_documents.id, params.documentId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!doc) throw new HttpError(404, "Document not found");
  const rows = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.documentId, params.documentId))
    .orderBy(asc(_blocks.rank));
  return rows.map((r) => BlockSchema.parse(r));
});
