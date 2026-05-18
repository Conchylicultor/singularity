import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { deleteLaunchPrompt } from "../../shared/endpoints";
import { launchPromptsTable } from "./tables";
import { launchPromptsServerResource } from "./resources";

export const handleDelete = implement(deleteLaunchPrompt, async ({ params }) => {
  await db.delete(launchPromptsTable).where(eq(launchPromptsTable.id, params.id));

  launchPromptsServerResource.notify();
  return { ok: true };
});
