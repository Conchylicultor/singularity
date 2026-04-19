import { desc } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { conversations } from "./schema";

export async function handleList(_req: Request): Promise<Response> {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  return Response.json(rows);
}
