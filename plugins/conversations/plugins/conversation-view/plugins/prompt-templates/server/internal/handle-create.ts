import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createPromptTemplate } from "../../shared/endpoints";
import { promptTemplatesTable } from "./tables";
import { promptTemplateAttachments } from "./tables-attachments";
import { promptTemplatesServerResource } from "./resources";
import { nextRank } from "./rank";

export const handleCreate = implement(createPromptTemplate, async ({ body }) => {
  if (body.title.trim() === "") {
    throw new HttpError(400, "title required");
  }

  const id = crypto.randomUUID();
  const rank = await nextRank();

  const [row] = await db
    .insert(promptTemplatesTable)
    .values({ id, title: body.title.trim(), prompt: body.prompt, rank })
    .returning();

  await promptTemplateAttachments.set(id, extractAttachmentIds(body.prompt));

  promptTemplatesServerResource.notify();
  return row;
});
