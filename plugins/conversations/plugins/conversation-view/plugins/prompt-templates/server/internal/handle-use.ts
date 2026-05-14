import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { promptTemplatesTable } from "./tables";
import { promptTemplatesServerResource } from "./resources";

export async function handleUse(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  const [updated] = await db
    .update(promptTemplatesTable)
    .set({ useCount: sql`${promptTemplatesTable.useCount} + 1` })
    .where(eq(promptTemplatesTable.id, id))
    .returning({ id: promptTemplatesTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
  if (!updated) return new Response("Not found", { status: 404 });

  promptTemplatesServerResource.notify();
  return Response.json({ ok: true });
}
