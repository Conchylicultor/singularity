import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { promptTemplatesTable } from "./tables";

export async function handleList(): Promise<Response> {
  const rows = await db
    .select()
    .from(promptTemplatesTable)
    .orderBy(asc(promptTemplatesTable.rank), asc(promptTemplatesTable.createdAt));
  return Response.json(rows);
}
