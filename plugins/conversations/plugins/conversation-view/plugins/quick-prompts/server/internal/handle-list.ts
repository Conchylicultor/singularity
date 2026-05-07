import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { quickPromptsTable } from "./tables";

export async function handleList(): Promise<Response> {
  const rows = await db
    .select()
    .from(quickPromptsTable)
    .orderBy(asc(quickPromptsTable.rank), asc(quickPromptsTable.createdAt));
  return Response.json(rows);
}
