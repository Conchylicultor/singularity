import { db } from "@server/db/client";
import { syncOwnerAttachments } from "@plugins/infra/plugins/attachments/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/paste-images/shared";
import { launchPromptsTable } from "./tables";
import { _launchPromptAttachments } from "./tables-attachments";
import { launchPromptsServerResource } from "./resources";
import { nextRank } from "./rank";

const VALID_MODELS = new Set(["sonnet", "opus"]);

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    prompt?: string;
    model?: string;
  };
  if (typeof body.title !== "string" || body.title.trim() === "") {
    return Response.json({ error: "title required" }, { status: 400 });
  }
  if (typeof body.prompt !== "string") {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }
  const model = body.model ?? "sonnet";
  if (!VALID_MODELS.has(model)) {
    return Response.json({ error: "model must be 'sonnet' or 'opus'" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(launchPromptsTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, model, rank })
    .returning();

  await syncOwnerAttachments(
    _launchPromptAttachments,
    id,
    extractAttachmentIds(body.prompt),
  );

  launchPromptsServerResource.notify();
  return Response.json(row, { status: 201 });
}
