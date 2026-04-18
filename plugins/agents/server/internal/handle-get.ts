import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { agents } from "../schema";

export async function handleGet(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(row);
}
