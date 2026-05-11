import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/paste-images/shared";
import { promptTemplatesTable } from "./tables";
import { promptTemplateAttachments } from "./tables-attachments";
import { promptTemplatesServerResource } from "./resources";

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    prompt?: string;
  };

  const patch: Partial<typeof promptTemplatesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.prompt === "string") patch.prompt = body.prompt;

  const [updated] = await db
    .update(promptTemplatesTable)
    .set(patch)
    .where(eq(promptTemplatesTable.id, id))
    .returning({ id: promptTemplatesTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) return new Response("Not found", { status: 404 });

  if (typeof body.prompt === "string") {
    await promptTemplateAttachments.set(id, extractAttachmentIds(body.prompt));
  }

  promptTemplatesServerResource.notify();
  return Response.json({ ok: true });
}
