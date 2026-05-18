import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listQuickPrompts } from "../../shared/endpoints";
import { quickPromptsTable } from "./tables";

export const handleList = implement(listQuickPrompts, async () => {
  const rows = await db
    .select()
    .from(quickPromptsTable)
    .orderBy(asc(quickPromptsTable.rank), asc(quickPromptsTable.createdAt));
  return rows;
});
