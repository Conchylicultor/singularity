import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateQuickPrompt } from "../../shared/endpoints";
import { quickPromptsTable } from "./tables";
import { quickPromptAttachments } from "./tables-attachments";
import { quickPromptsServerResource } from "./resources";

export const handleUpdate = implement(updateQuickPrompt, async ({ params, body }) => {
  const { id } = params;

  const patch: Partial<typeof quickPromptsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.prompt === "string") patch.prompt = body.prompt;

  const [updated] = await db
    .update(quickPromptsTable)
    .set(patch)
    .where(eq(quickPromptsTable.id, id))
    .returning({ id: quickPromptsTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) throw new HttpError(404, "Not found");

  if (typeof body.prompt === "string") {
    await quickPromptAttachments.set(id, extractAttachmentIds(body.prompt));
  }

  quickPromptsServerResource.notify();
  return { ok: true };
});
