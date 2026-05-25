import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getDocument } from "../../core/endpoints";
import { DocumentSchema } from "../../core/schemas";
import { _documents } from "./tables";

export const handleGetDocument = implement(getDocument, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_documents)
    .where(eq(_documents.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  return DocumentSchema.parse(row);
});
