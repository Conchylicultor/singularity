import { asc } from "drizzle-orm";
import { db } from "@server/db/client";
import { launchPromptsTable } from "./tables";

export async function handleList(): Promise<Response> {
  const rows = await db
    .select()
    .from(launchPromptsTable)
    .orderBy(asc(launchPromptsTable.rank), asc(launchPromptsTable.createdAt));
  return Response.json(rows);
}
