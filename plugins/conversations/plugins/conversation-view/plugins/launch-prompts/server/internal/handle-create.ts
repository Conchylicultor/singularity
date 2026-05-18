import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createLaunchPrompt } from "../../shared/endpoints";
import { launchPromptsTable } from "./tables";
import { launchPromptAttachments } from "./tables-attachments";
import { launchPromptsServerResource } from "./resources";
import { nextRank } from "./rank";

const VALID_MODELS = new Set(["sonnet", "opus"]);

export const handleCreate = implement(createLaunchPrompt, async ({ body }) => {
  if (body.title.trim() === "") {
    throw new HttpError(400, "title required");
  }
  const model = body.model ?? "sonnet";
  if (!VALID_MODELS.has(model)) {
    throw new HttpError(400, "model must be 'sonnet' or 'opus'");
  }

  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(launchPromptsTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, model, rank })
    .returning();

  await launchPromptAttachments.set(id, extractAttachmentIds(body.prompt));

  launchPromptsServerResource.notify();
  return row;
});
