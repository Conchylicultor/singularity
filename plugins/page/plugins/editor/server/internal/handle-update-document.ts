import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateDocument } from "../../core/endpoints";
import { DocumentSchema } from "../../core/schemas";
import { _documents } from "./tables";
import { documentsLiveResource } from "./resources";

export const handleUpdateDocument = implement(updateDocument, async ({ params, body }) => {
  if (body.parentId === params.id) {
    throw new HttpError(400, "Cannot parent a document to itself");
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") patch.title = body.title;
  if (body.parentId !== undefined) patch.parentId = body.parentId;
  if (body.rank !== undefined) patch.rank = body.rank.toJSON();
  if (typeof body.expanded === "boolean") patch.expanded = body.expanded;
  if (body.icon !== undefined) patch.icon = body.icon;
  const [updated] = await db
    .update(_documents)
    .set(patch)
    .where(eq(_documents.id, params.id))
    .returning({ id: _documents.id });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) throw new HttpError(404, "Not found");
  documentsLiveResource.notify();
  const [row] = await db
    .select()
    .from(_documents)
    .where(eq(_documents.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found after update");
  return DocumentSchema.parse(row);
});
