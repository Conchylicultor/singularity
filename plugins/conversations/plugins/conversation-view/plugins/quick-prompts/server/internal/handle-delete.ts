import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { deleteQuickPrompt } from "../../shared/endpoints";
import { quickPromptsTable } from "./tables";
import { quickPromptsServerResource } from "./resources";

export const handleDelete = implement(deleteQuickPrompt, async ({ params }) => {
  await db.delete(quickPromptsTable).where(eq(quickPromptsTable.id, params.id));

  quickPromptsServerResource.notify();
  return { ok: true };
});
