import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { quickPromptsTable } from "./tables";
import type { QuickPrompt } from "../../internal/resources";

export const quickPromptsServerResource = defineResource<QuickPrompt[]>({
  key: "quick-prompts",
  mode: "push",
  async loader() {
    const rows = await db
      .select()
      .from(quickPromptsTable)
      .orderBy(asc(quickPromptsTable.rank), asc(quickPromptsTable.createdAt));
    return rows as unknown as QuickPrompt[];
  },
});
