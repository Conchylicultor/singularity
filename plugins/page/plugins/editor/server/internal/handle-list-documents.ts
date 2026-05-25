import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listDocuments } from "../../core/endpoints";
import { DocumentSchema } from "../../core/schemas";
import { _documents } from "./tables";

export const handleListDocuments = implement(listDocuments, async () => {
  const rows = await db
    .select()
    .from(_documents)
    .orderBy(asc(_documents.createdAt));
  return rows.map((r) => DocumentSchema.parse(r));
});
