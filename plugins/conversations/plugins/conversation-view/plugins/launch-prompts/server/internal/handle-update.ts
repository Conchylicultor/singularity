import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { extractAttachmentIds } from "@plugins/primitives/plugins/paste-images/shared";
import { launchPromptsTable } from "./tables";
import { launchPromptAttachments } from "./tables-attachments";
import { launchPromptsServerResource } from "./resources";

const VALID_MODELS = new Set(["sonnet", "opus"]);

export async function handleUpdate(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return new Response("Missing id", { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    prompt?: string;
    model?: string;
  };

  if (typeof body.model === "string" && !VALID_MODELS.has(body.model)) {
    return Response.json({ error: "model must be 'sonnet' or 'opus'" }, { status: 400 });
  }

  const patch: Partial<typeof launchPromptsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.prompt === "string") patch.prompt = body.prompt;
  if (typeof body.model === "string") patch.model = body.model;

  const [updated] = await db
    .update(launchPromptsTable)
    .set(patch)
    .where(eq(launchPromptsTable.id, id))
    .returning({ id: launchPromptsTable.id });

  if (!updated) return new Response("Not found", { status: 404 });

  if (typeof body.prompt === "string") {
    await launchPromptAttachments.set(id, extractAttachmentIds(body.prompt));
  }

  launchPromptsServerResource.notify();
  return Response.json({ ok: true });
}
