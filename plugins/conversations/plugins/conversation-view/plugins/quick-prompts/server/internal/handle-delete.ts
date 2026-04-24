import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { quickPromptsTable } from "./tables";
import { quickPromptsServerResource } from "./resources";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  await db.delete(quickPromptsTable).where(eq(quickPromptsTable.id, id));

  quickPromptsServerResource.notify();
  return Response.json({ ok: true });
}
