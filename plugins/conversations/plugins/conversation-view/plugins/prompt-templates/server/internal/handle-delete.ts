import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { deletePromptTemplate } from "../../shared/endpoints";
import { promptTemplatesTable } from "./tables";
import { promptTemplatesServerResource } from "./resources";

export const handleDelete = implement(deletePromptTemplate, async ({ params }) => {
  await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, params.id));

  promptTemplatesServerResource.notify();
  return { ok: true };
});
