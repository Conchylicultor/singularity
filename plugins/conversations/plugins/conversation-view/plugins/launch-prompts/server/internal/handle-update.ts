import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { updateLaunchPrompt } from "../../shared/endpoints";
import { launchPromptsTable } from "./tables";
import { launchPromptAttachments } from "./tables-attachments";
import { launchPromptsServerResource } from "./resources";

const VALID_MODELS = new Set(["sonnet", "opus"]);

export const handleUpdate = implement(updateLaunchPrompt, async ({ params, body }) => {
  const { id } = params;

  if (typeof body.model === "string" && !VALID_MODELS.has(body.model)) {
    throw new HttpError(400, "model must be 'sonnet' or 'opus'");
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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!updated) throw new HttpError(404, "Not found");

  if (typeof body.prompt === "string") {
    await launchPromptAttachments.set(id, extractAttachmentIds(body.prompt));
  }

  launchPromptsServerResource.notify();
  return { ok: true };
});
