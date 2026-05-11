import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { agents } from "./schema";

export async function handleGet(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const [row] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(row);
}
