import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { promptTemplatesTable } from "./tables";
import { promptTemplateAttachments } from "./tables-attachments";
import { promptTemplatesServerResource } from "./resources";
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
    .insert(promptTemplatesTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, rank })
    .returning();

  await promptTemplateAttachments.set(id, extractAttachmentIds(body.prompt));

  promptTemplatesServerResource.notify();
  return Response.json(row, { status: 201 });
}
