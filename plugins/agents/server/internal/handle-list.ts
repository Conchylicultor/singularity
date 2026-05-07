import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { agents } from "./schema";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await db
    .select()
    .from(agents)
    .orderBy(asc(agents.rank), asc(agents.createdAt));
  return Response.json(rows);
}
