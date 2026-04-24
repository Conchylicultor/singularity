import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { _improve_config } from "./tables";
import { DEFAULT_PROMPT_TEMPLATE, type ImproveConfig } from "../../shared/types";

const ROW_ID = "default";

export async function getImproveConfig(): Promise<ImproveConfig> {
  const [row] = await db
    .select()
    .from(_improve_config)
    .where(eq(_improve_config.id, ROW_ID))
    .limit(1);
  if (row) return { promptTemplate: row.promptTemplate };
  return { promptTemplate: DEFAULT_PROMPT_TEMPLATE };
}

export async function setImproveConfig(patch: Partial<ImproveConfig>): Promise<ImproveConfig> {
  const current = await getImproveConfig();
  const next: ImproveConfig = {
    promptTemplate: patch.promptTemplate ?? current.promptTemplate,
  };
  await db
    .insert(_improve_config)
    .values({ id: ROW_ID, promptTemplate: next.promptTemplate })
    .onConflictDoUpdate({
      target: _improve_config.id,
      set: { promptTemplate: next.promptTemplate, updatedAt: new Date() },
    });
  return next;
}
