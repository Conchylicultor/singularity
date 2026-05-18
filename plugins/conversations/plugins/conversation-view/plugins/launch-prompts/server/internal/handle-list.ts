import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listLaunchPrompts } from "../../shared/endpoints";
import { launchPromptsTable } from "./tables";

export const handleList = implement(listLaunchPrompts, async () => {
  const rows = await db
    .select()
    .from(launchPromptsTable)
    .orderBy(asc(launchPromptsTable.rank), asc(launchPromptsTable.createdAt));
  return rows;
});
