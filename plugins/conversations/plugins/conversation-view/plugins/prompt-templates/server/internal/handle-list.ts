import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listPromptTemplates } from "../../shared/endpoints";
import { promptTemplatesTable } from "./tables";

export const handleList = implement(listPromptTemplates, async () => {
  const rows = await db
    .select()
    .from(promptTemplatesTable)
    .orderBy(asc(promptTemplatesTable.rank), asc(promptTemplatesTable.createdAt));
  return rows;
});
