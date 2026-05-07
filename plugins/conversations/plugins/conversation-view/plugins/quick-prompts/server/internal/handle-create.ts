import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/paste-images/shared";
import { quickPromptsTable } from "./tables";
import { quickPromptAttachments } from "./tables-attachments";
import { quickPromptsServerResource } from "./resources";
import { nextRank } from "./rank";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    prompt?: string;
  };
  if (typeof body.title !== "string" || body.title.trim() === "") {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  if (typeof body.prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(quickPromptsTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, rank })
    .returning();

  await quickPromptAttachments.set(id, extractAttachmentIds(body.prompt));

  quickPromptsServerResource.notify();
  return Response.json(row, { status: 201 });
}
