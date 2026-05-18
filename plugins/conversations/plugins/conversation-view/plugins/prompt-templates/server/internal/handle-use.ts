import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { usePromptTemplate } from "../../shared/endpoints";
import { promptTemplatesTable } from "./tables";
import { promptTemplatesServerResource } from "./resources";

export const handleUse = implement(usePromptTemplate, async ({ params }) => {
  const [updated] = await db
    .update(promptTemplatesTable)
    .set({ useCount: sql`${promptTemplatesTable.useCount} + 1` })
    .where(eq(promptTemplatesTable.id, params.id))
    .returning({ id: promptTemplatesTable.id });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
  if (!updated) throw new HttpError(404, "Not found");

  promptTemplatesServerResource.notify();
  return { ok: true };
});
