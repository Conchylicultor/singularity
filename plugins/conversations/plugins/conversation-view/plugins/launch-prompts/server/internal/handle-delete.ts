import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { launchPromptsTable } from "./tables";
import { launchPromptsServerResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  await db.delete(launchPromptsTable).where(eq(launchPromptsTable.id, id));

  launchPromptsServerResource.notify();
  return Response.json({ ok: true });
}
