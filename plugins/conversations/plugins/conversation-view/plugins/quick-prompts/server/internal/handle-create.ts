import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createQuickPrompt } from "../../shared/endpoints";
import { quickPromptsTable } from "./tables";
import { quickPromptAttachments } from "./tables-attachments";
import { quickPromptsServerResource } from "./resources";
import { nextRank } from "./rank";

export const handleCreate = implement(createQuickPrompt, async ({ body }) => {
  if (body.title.trim() === "") {
    throw new HttpError(400, "title required");
  }

  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(quickPromptsTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, rank })
    .returning();

  await quickPromptAttachments.set(id, extractAttachmentIds(body.prompt));

  quickPromptsServerResource.notify();
  return row;
});
