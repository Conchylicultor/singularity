import { eq } from "drizzle-orm";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createDocument } from "../../core/endpoints";
import { DocumentSchema } from "../../core/schemas";
import { _documents } from "./tables";
import { documentsLiveResource } from "./resources";

export const handleCreateDocument = implement(createDocument, async ({ body }) => {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const parentId = body.parentId ?? null;
  const rank = body.rank
    ?? await nextRankUnder(_documents, _documents.parentId, parentId);
  await db.insert(_documents).values({
    id,
    title: body.title ?? "Untitled",
    parentId,
    rank: rank.toJSON(),
    icon: body.icon ?? null,
  });
  documentsLiveResource.notify();
  const [row] = await db
    .select()
    .from(_documents)
    .where(eq(_documents.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created document");
  return DocumentSchema.parse(row);
});
