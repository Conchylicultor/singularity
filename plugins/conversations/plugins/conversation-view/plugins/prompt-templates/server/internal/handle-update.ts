import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updatePromptTemplate } from "../../shared/endpoints";
import { promptTemplatesTable } from "./tables";
import { promptTemplateAttachments } from "./tables-attachments";
import { promptTemplatesServerResource } from "./resources";

export const handleUpdate = implement(updatePromptTemplate, async ({ params, body }) => {
  const { id } = params;

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
  if (!updated) throw new HttpError(404, "Not found");

  if (typeof body.prompt === "string") {
    await promptTemplateAttachments.set(id, extractAttachmentIds(body.prompt));
  }

  promptTemplatesServerResource.notify();
  return { ok: true };
});
