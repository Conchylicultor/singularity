import { asc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { tasks } from "../schema";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await db.select().from(tasks).orderBy(asc(tasks.createdAt));
  return Response.json(rows);
}
