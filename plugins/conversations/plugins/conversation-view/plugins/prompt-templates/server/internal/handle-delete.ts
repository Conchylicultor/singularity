import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { promptTemplatesTable } from "./tables";
import { promptTemplatesServerResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  await db.delete(promptTemplatesTable).where(eq(promptTemplatesTable.id, id));

  promptTemplatesServerResource.notify();
  return Response.json({ ok: true });
}
